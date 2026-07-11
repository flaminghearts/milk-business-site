document.addEventListener('DOMContentLoaded', () => {
    const authForm = document.getElementById('authForm');
    const authMode = document.getElementById('authMode');
    const nameGroup = document.getElementById('nameGroup');
    const authMessage = document.getElementById('authMessage');
    const customerForm = document.getElementById('customerForm');
    const orderMessage = document.getElementById('orderMessage');
    const adminAuthForm = document.getElementById('adminAuthForm');
    const adminAuthMessage = document.getElementById('adminAuthMessage');
    const adminDashboard = document.getElementById('adminDashboard');
    const ordersTableBody = document.getElementById('ordersTableBody');
    const orderCount = document.getElementById('orderCount');
    const orderStatusSummary = document.getElementById('orderStatusSummary');
    const stockSummary = document.getElementById('stockSummary');
    const productForm = document.getElementById('productForm');
    const productMessage = document.getElementById('productMessage');
    const productList = document.getElementById('productList');
    const productGrid = document.getElementById('productGrid');

    const toggleNameGroup = () => {
        if (nameGroup) {
            nameGroup.style.display = authMode && authMode.value === 'register' ? 'block' : 'none';
        }
    };

    if (authMode) {
        authMode.addEventListener('change', toggleNameGroup);
        toggleNameGroup();
    }

    if (authForm) {
        authForm.addEventListener('submit', async(event) => {
            event.preventDefault();
            const formData = new FormData(authForm);
            const payload = {
                mode: formData.get('mode') || 'login',
                role: 'customer',
                email: formData.get('email') || '',
                password: formData.get('password') || '',
                name: formData.get('name') || '',
                phone: formData.get('phone') || '',
            };
            authMessage.textContent = 'Signing in…';
            try {
                const response = await fetch('/api/auth', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                });
                const result = await response.json();
                if (!response.ok) {
                    throw new Error(result.error || 'Authentication failed');
                }
                authMessage.textContent = result.message || 'Signed in successfully';
                if (customerForm) {
                    const customerName = document.getElementById('customerName');
                    const customerEmail = document.getElementById('customerEmail');
                    const customerPhone = document.getElementById('customerPhone');
                    if (customerName) customerName.value = result.user.name || '';
                    if (customerEmail) customerEmail.value = result.user.email || '';
                    if (customerPhone) customerPhone.value = result.user.phone || '';
                }
            } catch (error) {
                authMessage.textContent = error.message;
            }
        });
    }

    if (customerForm) {
        customerForm.addEventListener('submit', async(event) => {
            event.preventDefault();
            const formData = new FormData(customerForm);
            const payload = Object.fromEntries(formData.entries());
            orderMessage.textContent = 'Submitting your order request…';
            try {
                const response = await fetch('/api/orders', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                });
                const result = await response.json();
                if (!response.ok) {
                    throw new Error(result.error || 'Order submission failed');
                }
                orderMessage.textContent = result.message || 'Order saved successfully';
                customerForm.reset();
            } catch (error) {
                orderMessage.textContent = error.message;
            }
        });
    }

    const renderProductCards = (products, container) => {
        if (!container) return;
        container.innerHTML = '';
        if (!products.length) {
            container.innerHTML = '<p class="helper">No products published yet.</p>';
            return;
        }
        products.forEach((product) => {
            const article = document.createElement('article');
            article.className = 'card';
            article.innerHTML = `
                <h3>${product.name}</h3>
                <p>${product.description}</p>
                <p class="helper">Category: ${product.category}</p>
                <p class="helper">Price: ${product.price} · Stock: ${product.stock}</p>
            `;
            container.appendChild(article);
        });
    };

    if (productGrid) {
        fetch('/api/products')
            .then((response) => response.json())
            .then((result) => {
                if (result.products) {
                    renderProductCards(result.products, productGrid);
                }
            })
            .catch(() => {
                productGrid.innerHTML = '<p class="helper">Unable to load products right now.</p>';
            });
    }

    if (productForm) {
        productForm.addEventListener('submit', async(event) => {
            event.preventDefault();
            const formData = new FormData(productForm);
            const payload = Object.fromEntries(formData.entries());
            productMessage.textContent = 'Adding product…';
            try {
                const response = await fetch('/api/products', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                });
                const result = await response.json();
                if (!response.ok) {
                    throw new Error(result.error || 'Unable to add product');
                }
                productMessage.textContent = result.message || 'Product added successfully';
                productForm.reset();
                if (productList) {
                    fetch('/api/products')
                        .then((response) => response.json())
                        .then((result) => {
                            if (result.products) {
                                renderProductCards(result.products, productList);
                            }
                        });
                }
            } catch (error) {
                productMessage.textContent = error.message;
            }
        });
    }

    if (adminAuthForm) {
        adminAuthForm.addEventListener('submit', async(event) => {
            event.preventDefault();
            const formData = new FormData(adminAuthForm);
            const payload = {
                mode: 'login',
                role: 'admin',
                email: formData.get('email') || '',
                password: formData.get('password') || '',
            };
            adminAuthMessage.textContent = 'Signing in…';
            try {
                const response = await fetch('/api/auth', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                });
                const result = await response.json();
                if (!response.ok) {
                    throw new Error(result.error || 'Admin sign-in failed');
                }
                adminAuthMessage.textContent = result.message || 'Signed in as admin';
                if (adminDashboard) {
                    adminDashboard.style.display = 'grid';
                }
                if (ordersTableBody) {
                    const renderOrders = (orders) => {
                        ordersTableBody.innerHTML = '';
                        if (!orders.length) {
                            ordersTableBody.innerHTML = '<tr><td colspan="4" class="helper">No orders yet.</td></tr>';
                            if (orderCount) orderCount.textContent = '0';
                            if (orderStatusSummary) orderStatusSummary.textContent = 'Pending';
                            if (stockSummary) stockSummary.textContent = 'Fresh: 900L';
                            return;
                        }
                        const latest = orders[0];
                        if (orderCount) orderCount.textContent = String(orders.length);
                        if (orderStatusSummary) orderStatusSummary.textContent = latest.status;
                        if (stockSummary) stockSummary.textContent = `Fresh: ${Math.max(900 - orders.length * 12, 120)}L`;
                        orders.slice(0, 6).forEach((order) => {
                            const row = document.createElement('tr');
                            row.innerHTML = `
                                <td>${order.customerName}</td>
                                <td>${order.product}</td>
                                <td>${order.quantity}</td>
                                <td><span class="tag ${order.status.toLowerCase() === 'paid' ? 'paid' : 'pending'}">${order.status}</span></td>
                            `;
                            ordersTableBody.appendChild(row);
                        });
                    };

                    fetch('/api/orders')
                        .then((response) => response.json())
                        .then((result) => {
                            if (result.orders) {
                                renderOrders(result.orders);
                            }
                        })
                        .catch(() => {
                            if (ordersTableBody) {
                                ordersTableBody.innerHTML = '<tr><td colspan="4" class="helper">Unable to load orders right now.</td></tr>';
                            }
                        });
                }
                if (productList) {
                    fetch('/api/products')
                        .then((response) => response.json())
                        .then((result) => {
                            if (result.products) {
                                renderProductCards(result.products, productList);
                            }
                        });
                }
            } catch (error) {
                adminAuthMessage.textContent = error.message;
            }
        });
    }
});