document.addEventListener('DOMContentLoaded', () => {
    // --- Global Setup & Shared Variables ---
    let currentUser = null;

    // --- DOM Elements ---
    // Common
    const logoutBtn = document.getElementById('logoutBtn');
    const contactForm = document.getElementById('contactForm');
    const contactMessage = document.getElementById('contactMessage');

    // Customer Portal Elements
    const authView = document.getElementById('authView');
    const dashboardView = document.getElementById('dashboardView');
    const authForm = document.getElementById('authForm');
    const authMode = document.getElementById('authMode');
    const nameGroup = document.getElementById('nameGroup');
    const authMessage = document.getElementById('authMessage');
    const welcomeUserName = document.getElementById('welcomeUserName');
    
    const myOrdersTableBody = document.getElementById('myOrdersTableBody');
    const customerForm = document.getElementById('customerForm');
    const orderMessage = document.getElementById('orderMessage');
    
    // Customer profile inputs
    const profileForm = document.getElementById('profileForm');
    const profileName = document.getElementById('profileName');
    const profilePhone = document.getElementById('profilePhone');
    const profilePassword = document.getElementById('profilePassword');
    const profileMessage = document.getElementById('profileMessage');

    // Mock Payment Modal Elements
    const paymentModal = document.getElementById('paymentModal');
    const closePaymentModal = document.getElementById('closePaymentModal');
    const paymentForm = document.getElementById('paymentForm');
    const paymentOrderId = document.getElementById('paymentOrderId');
    const paymentProductDetails = document.getElementById('paymentProductDetails');
    const paymentTargetOrderId = document.getElementById('paymentTargetOrderId');
    const paymentMethod = document.getElementById('paymentMethod');
    const mpesaFields = document.getElementById('mpesaFields');
    const cardFields = document.getElementById('cardFields');
    const paymentMessage = document.getElementById('paymentMessage');

    // Admin Portal Elements
    const adminAuthForm = document.getElementById('adminAuthForm');
    const adminAuthMessage = document.getElementById('adminAuthMessage');
    const adminLogoutBtn = document.getElementById('adminLogoutBtn');
    const adminNameDisplay = document.getElementById('adminNameDisplay');
    
    const ordersTableBody = document.getElementById('ordersTableBody');
    const orderCount = document.getElementById('orderCount');
    const revenueSummary = document.getElementById('revenueSummary');
    const pendingSummary = document.getElementById('pendingSummary');
    
    const inventoryTableBody = document.getElementById('inventoryTableBody');
    const productForm = document.getElementById('productForm');
    const productFormTitle = document.getElementById('productFormTitle');
    const editProductId = document.getElementById('editProductId');
    const productSubmitBtn = document.getElementById('productSubmitBtn');
    const cancelEditBtn = document.getElementById('cancelEditBtn');
    const productMessage = document.getElementById('productMessage');
    const productGrid = document.getElementById('productGrid'); // Public products page
    const inquiriesListContainer = document.getElementById('inquiriesListContainer');

    // --- Tab Switching Logic ---
    const setupTabs = () => {
        const tabLinks = document.querySelectorAll('.tab-link');
        tabLinks.forEach(link => {
            link.addEventListener('click', () => {
                const targetTabId = link.getAttribute('data-tab');
                
                // Toggle active class on buttons
                tabLinks.forEach(btn => btn.classList.remove('active'));
                link.classList.add('active');

                // Toggle active class on content containers
                const tabContents = document.querySelectorAll('.tab-content');
                tabContents.forEach(content => {
                    content.classList.remove('active');
                    if (content.id === targetTabId) {
                        content.classList.add('active');
                    }
                });
            });
        });
    };
    setupTabs();

    // Toggle customer register name group
    if (authMode) {
        authMode.addEventListener('change', () => {
            if (nameGroup) {
                nameGroup.style.display = authMode.value === 'register' ? 'block' : 'none';
                const nameInput = document.getElementById('authName');
                if (nameInput) nameInput.required = authMode.value === 'register';
            }
        });
    }

    // --- Initial Session Verification ---
    const checkSession = async () => {
        try {
            const response = await fetch('/api/me');
            const result = await response.json();
            if (result.authenticated) {
                currentUser = result.user;
                // If admin is already logged in and on the customer portal, redirect to admin page
                if (currentUser.role === 'admin' && window.location.pathname.includes('customer-login')) {
                    window.location.href = 'admin-login.html';
                    return;
                }
                initializeDashboard();
            } else {
                showAuthView();
            }
        } catch (e) {
            showAuthView();
        }
    };

    const showAuthView = () => {
        if (authView) authView.style.display = 'grid';
        if (dashboardView) dashboardView.style.display = 'none';
        if (adminAuthForm) {
            if (authView) authView.style.display = 'block';
        }
    };

    const initializeDashboard = () => {
        if (authView) authView.style.display = 'none';
        if (dashboardView) dashboardView.style.display = 'block';

        if (currentUser.role === 'customer') {
            if (welcomeUserName) welcomeUserName.textContent = currentUser.name;
            // Autofill profile form
            if (profileName) profileName.value = currentUser.name;
            if (profilePhone) profilePhone.value = currentUser.phone || '';
            // Autofill hidden inputs in order form
            const custNameInput = document.getElementById('customerName');
            const custEmailInput = document.getElementById('customerEmail');
            const custPhoneInput = document.getElementById('customerPhone');
            if (custNameInput) custNameInput.value = currentUser.name;
            if (custEmailInput) custEmailInput.value = currentUser.email;
            if (custPhoneInput) custPhoneInput.value = currentUser.phone || '';

            loadCustomerOrders();
        } else if (currentUser.role === 'admin') {
            if (adminNameDisplay) adminNameDisplay.textContent = currentUser.name;
            loadAdminDashboard();
        }
    };

    // --- Customer Actions ---
    
    // Auth submission (Customer login/register)
    if (authForm) {
        authForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = new FormData(authForm);
            const mode = formData.get('mode') || 'login';
            const payload = {
                mode: mode,
                // For registration always create a customer account.
                // For login, omit role so the server authenticates by email+password
                // and returns the actual role (admin or customer) from the database.
                role: mode === 'register' ? 'customer' : undefined,
                email: formData.get('email') || '',
                password: formData.get('password') || '',
                name: formData.get('name') || '',
                phone: formData.get('phone') || '',
            };
            if (authMessage) authMessage.textContent = 'Processing request…';
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
                currentUser = result.user;
                if (authMessage) authMessage.textContent = '';
                authForm.reset();

                // If admin credentials entered at customer portal, redirect to admin dashboard
                if (currentUser.role === 'admin') {
                    if (authMessage) {
                        authMessage.className = 'helper helper-success';
                        authMessage.textContent = 'Admin account detected — redirecting to admin dashboard…';
                    }
                    setTimeout(() => {
                        window.location.href = 'admin-login.html';
                    }, 800);
                    return;
                }

                initializeDashboard();
            } catch (error) {
                if (authMessage) {
                    authMessage.className = 'helper helper-error';
                    authMessage.textContent = error.message;
                }
            }
        });
    }

    // Place a new order request
    if (customerForm) {
        customerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = new FormData(customerForm);
            const payload = Object.fromEntries(formData.entries());
            if (orderMessage) orderMessage.textContent = 'Submitting order request…';
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
                if (orderMessage) {
                    orderMessage.className = 'helper helper-success';
                    orderMessage.textContent = result.message || 'Order placed successfully!';
                }
                customerForm.reset();
                // Reset user hidden values
                const custNameInput = document.getElementById('customerName');
                const custEmailInput = document.getElementById('customerEmail');
                const custPhoneInput = document.getElementById('customerPhone');
                if (custNameInput) custNameInput.value = currentUser.name;
                if (custEmailInput) custEmailInput.value = currentUser.email;
                if (custPhoneInput) custPhoneInput.value = currentUser.phone || '';

                loadCustomerOrders();
                // Switch tab back to Orders after brief delay
                setTimeout(() => {
                    const tabBtn = document.querySelector('[data-tab="ordersTab"]');
                    if (tabBtn) tabBtn.click();
                    if (orderMessage) orderMessage.textContent = '';
                }, 1500);
            } catch (error) {
                if (orderMessage) {
                    orderMessage.className = 'helper helper-error';
                    orderMessage.textContent = error.message;
                }
            }
        });
    }

    // Customer profile update
    if (profileForm) {
        profileForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = new FormData(profileForm);
            const payload = Object.fromEntries(formData.entries());
            if (profileMessage) profileMessage.textContent = 'Updating profile details…';
            try {
                const response = await fetch('/api/profile/update', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                });
                const result = await response.json();
                if (!response.ok) {
                    throw new Error(result.error || 'Profile update failed');
                }
                currentUser = result.user;
                if (welcomeUserName) welcomeUserName.textContent = currentUser.name;
                if (profilePassword) profilePassword.value = '';
                if (profileMessage) {
                    profileMessage.className = 'helper helper-success';
                    profileMessage.textContent = result.message || 'Profile updated successfully!';
                }
                setTimeout(() => { if (profileMessage) profileMessage.textContent = ''; }, 3000);
            } catch (error) {
                if (profileMessage) {
                    profileMessage.className = 'helper helper-error';
                    profileMessage.textContent = error.message;
                }
            }
        });
    }

    // Load Customer Orders history
    const loadCustomerOrders = async () => {
        if (!myOrdersTableBody) return;
        try {
            const response = await fetch('/api/my-orders');
            const result = await response.json();
            myOrdersTableBody.innerHTML = '';
            if (!result.orders || !result.orders.length) {
                myOrdersTableBody.innerHTML = '<tr><td colspan="5" class="helper">You have not placed any orders yet.</td></tr>';
                return;
            }
            result.orders.forEach(order => {
                const row = document.createElement('tr');
                let actionBtn = '';
                if (order.status.toLowerCase() === 'pending') {
                    actionBtn = `<button class="btn btn-primary btn-small pay-btn" data-id="${order.id}" data-product="${order.product}" data-quantity="${order.quantity}">Pay Now</button>`;
                } else {
                    actionBtn = `<span class="helper">None</span>`;
                }

                row.innerHTML = `
                    <td>${order.createdAt.split(' ')[0]}</td>
                    <td>${order.product}</td>
                    <td>${order.quantity}</td>
                    <td><span class="tag ${order.status.toLowerCase()}">${order.status}</span></td>
                    <td>${actionBtn}</td>
                `;
                myOrdersTableBody.appendChild(row);
            });

            // Bind pay buttons
            document.querySelectorAll('.pay-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const id = btn.getAttribute('data-id');
                    const product = btn.getAttribute('data-product');
                    const qty = btn.getAttribute('data-quantity');
                    openCheckout(id, product, qty);
                });
            });
        } catch (e) {
            myOrdersTableBody.innerHTML = '<tr><td colspan="5" class="helper">Error loading orders.</td></tr>';
        }
    };

    // Customer logout
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            await fetch('/api/logout', { method: 'POST' });
            currentUser = null;
            window.location.reload();
        });
    }

    // --- Checkout & Payment Modal Flow ---
    const openCheckout = (id, product, quantity) => {
        if (!paymentModal) return;
        paymentTargetOrderId.value = id;
        paymentOrderId.textContent = id;
        paymentProductDetails.textContent = `${product} (${quantity})`;
        if (paymentMessage) paymentMessage.textContent = '';
        paymentModal.style.display = 'flex';
    };

    if (closePaymentModal) {
        closePaymentModal.addEventListener('click', () => {
            if (paymentModal) paymentModal.style.display = 'none';
        });
    }

    // Switch payment input fields based on selection
    if (paymentMethod) {
        paymentMethod.addEventListener('change', () => {
            if (paymentMethod.value === 'mpesa') {
                if (mpesaFields) mpesaFields.style.display = 'block';
                if (cardFields) cardFields.style.display = 'none';
            } else {
                if (mpesaFields) mpesaFields.style.display = 'none';
                if (cardFields) cardFields.style.display = 'block';
            }
        });
    }

    // Handle payment simulation form submission
    if (paymentForm) {
        paymentForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const orderId = paymentTargetOrderId.value;
            const submitBtn = document.getElementById('submitPaymentBtn');
            
            if (submitBtn) submitBtn.disabled = true;
            if (paymentMessage) {
                paymentMessage.className = 'helper';
                paymentMessage.textContent = 'Contacting payment gateway…';
            }

            // Simulate server network request delay
            setTimeout(async () => {
                try {
                    const response = await fetch('/api/orders/update-status', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ orderId: orderId, status: 'Paid' })
                    });
                    const result = await response.json();
                    if (!response.ok) throw new Error(result.error);
                    
                    if (paymentMessage) {
                        paymentMessage.className = 'helper helper-success';
                        paymentMessage.textContent = 'Payment successful! Updating status…';
                    }
                    
                    setTimeout(() => {
                        if (paymentModal) paymentModal.style.display = 'none';
                        if (submitBtn) submitBtn.disabled = false;
                        paymentForm.reset();
                        loadCustomerOrders();
                    }, 1000);
                } catch (err) {
                    if (submitBtn) submitBtn.disabled = false;
                    if (paymentMessage) {
                        paymentMessage.className = 'helper helper-error';
                        paymentMessage.textContent = err.message || 'Payment simulation failed.';
                    }
                }
            }, 1500);
        });
    }

    // --- Admin Actions ---

    // Admin Auth Submit
    if (adminAuthForm) {
        adminAuthForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = new FormData(adminAuthForm);
            const payload = {
                mode: 'login',
                role: 'admin',
                email: formData.get('email') || '',
                password: formData.get('password') || '',
            };
            if (adminAuthMessage) adminAuthMessage.textContent = 'Authenticating…';
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
                currentUser = result.user;
                if (adminAuthMessage) adminAuthMessage.textContent = '';
                adminAuthForm.reset();
                initializeDashboard();
            } catch (error) {
                if (adminAuthMessage) adminAuthMessage.textContent = error.message;
            }
        });
    }

    // Admin Sign Out
    if (adminLogoutBtn) {
        adminLogoutBtn.addEventListener('click', async () => {
            await fetch('/api/logout', { method: 'POST' });
            currentUser = null;
            window.location.reload();
        });
    }

    const loadAdminDashboard = () => {
        loadAdminOrders();
        loadInventory();
        loadInquiries();
    };

    // Load admin orders, calculate metrics, and draw chart
    const loadAdminOrders = async () => {
        if (!ordersTableBody) return;
        try {
            const response = await fetch('/api/orders');
            const result = await response.json();
            ordersTableBody.innerHTML = '';
            
            const orders = result.orders || [];
            updateAdminMetrics(orders);
            
            if (!orders.length) {
                ordersTableBody.innerHTML = '<tr><td colspan="7" class="helper">No orders found.</td></tr>';
                return;
            }

            orders.forEach(order => {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td><strong>#${order.id}</strong></td>
                    <td>${order.customerName}</td>
                    <td>${order.customerPhone}<br><span class="helper" style="font-size: 0.8rem;">${order.customerEmail}</span></td>
                    <td>${order.product}</td>
                    <td>${order.quantity}</td>
                    <td><span class="tag ${order.status.toLowerCase()}">${order.status}</span></td>
                    <td>
                        <select class="status-select" data-id="${order.id}">
                            <option value="Pending" ${order.status === 'Pending' ? 'selected' : ''}>Pending</option>
                            <option value="Paid" ${order.status === 'Paid' ? 'selected' : ''}>Paid</option>
                            <option value="Processing" ${order.status === 'Processing' ? 'selected' : ''}>Processing</option>
                            <option value="Shipped" ${order.status === 'Shipped' ? 'selected' : ''}>Shipped</option>
                            <option value="Completed" ${order.status === 'Completed' ? 'selected' : ''}>Completed</option>
                            <option value="Cancelled" ${order.status === 'Cancelled' ? 'selected' : ''}>Cancelled</option>
                        </select>
                    </td>
                `;
                ordersTableBody.appendChild(row);
            });

            // Bind status change dropdowns
            document.querySelectorAll('.status-select').forEach(select => {
                select.addEventListener('change', async () => {
                    const id = select.getAttribute('data-id');
                    const status = select.value;
                    try {
                        const res = await fetch('/api/orders/update-status', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ orderId: id, status: status })
                        });
                        if (res.ok) {
                            loadAdminOrders(); // Reload to refresh metrics & chart
                        }
                    } catch (err) {
                        console.error('Failed to update status', err);
                    }
                });
            });
        } catch (e) {
            ordersTableBody.innerHTML = '<tr><td colspan="7" class="helper">Error loading orders list.</td></tr>';
        }
    };

    // Calculate metrics and render SVG dynamic chart
    const updateAdminMetrics = (orders) => {
        if (!orderCount) return;
        
        let pending = 0;
        let revenue = 0;
        const statusCounts = {
            'Pending': 0,
            'Paid': 0,
            'Processing': 0,
            'Completed': 0,
            'Cancelled': 0,
            'Shipped': 0 // We'll count shipped as processing/completed in chart
        };

        orders.forEach(order => {
            const status = order.status;
            if (status === 'Pending') pending++;
            
            // Increment status count
            if (statusCounts[status] !== undefined) {
                statusCounts[status]++;
            } else if (status === 'Shipped') {
                statusCounts['Processing']++; // Combine Shipped into Processing for visual chart simplicity
            }

            // Estimate Revenue: Kes 120/L Fresh, Kes 180/L Long Life
            const qtyNum = parseInt(order.quantity.replace(/[^0-9]/g, '')) || 0;
            const pricePerL = order.product.toLowerCase().includes('long life') ? 180 : 120;
            
            // Only count Paid, Processing, Shipped, Completed towards active business revenue
            if (['paid', 'processing', 'shipped', 'completed'].includes(status.toLowerCase())) {
                revenue += qtyNum * pricePerL;
            }
        });

        // Update metric labels
        orderCount.textContent = orders.length;
        pendingSummary.textContent = pending;
        
        // Format revenue label
        const formattedRev = new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES', maximumFractionDigits: 0 }).format(revenue);
        revenueSummary.textContent = formattedRev.replace('KES', 'Kes');

        // Draw visual SVG chart
        renderSVGChart(statusCounts);
    };

    const renderSVGChart = (statusCounts) => {
        const svg = document.getElementById('svgChart');
        if (!svg) return;

        const maxVal = Math.max(...Object.values(statusCounts), 5); // default base to 5 to handle low order volume
        const bars = svg.querySelectorAll('.chart-bar');
        
        const labels = ['Pending', 'Paid', 'Processing', 'Completed', 'Cancelled'];
        
        bars.forEach((bar, idx) => {
            const status = labels[idx];
            const val = statusCounts[status] || 0;
            const height = (val / maxVal) * 180; // Max height 180px
            const y = 250 - height; // base y coordinate is 250
            
            // Set dynamic attributes
            bar.setAttribute('height', height);
            bar.setAttribute('y', y);
            
            // Add a title element for hover tooltip
            const existingTitle = bar.querySelector('title');
            if (existingTitle) {
                existingTitle.textContent = `${status}: ${val} orders`;
            } else {
                const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
                title.textContent = `${status}: ${val} orders`;
                bar.appendChild(title);
            }
        });
    };

    // Load product inventory
    const loadInventory = async () => {
        if (!inventoryTableBody) return;
        try {
            const response = await fetch('/api/products');
            const result = await response.json();
            inventoryTableBody.innerHTML = '';
            
            const products = result.products || [];
            if (!products.length) {
                inventoryTableBody.innerHTML = '<tr><td colspan="5" class="helper">No products in inventory.</td></tr>';
                return;
            }

            products.forEach(prod => {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td><strong>${prod.name}</strong><br><span class="helper" style="font-size: 0.8rem;">${prod.description.substring(0, 50)}…</span></td>
                    <td>${prod.price}</td>
                    <td>${prod.stock}</td>
                    <td><span class="tag ${prod.isPublished ? 'paid' : 'pending'}">${prod.isPublished ? 'Published' : 'Draft'}</span></td>
                    <td>
                        <div class="btn-row" style="gap: 0.35rem;">
                            <button class="btn btn-secondary btn-small edit-prod-btn" 
                                    data-id="${prod.id}" 
                                    data-name="${prod.name}" 
                                    data-desc="${prod.description}" 
                                    data-cat="${prod.category}" 
                                    data-price="${prod.price}" 
                                    data-stock="${prod.stock}" 
                                    data-pub="${prod.isPublished}">Edit</button>
                            <button class="btn btn-danger btn-small delete-prod-btn" data-id="${prod.id}">Delete</button>
                        </div>
                    </td>
                `;
                inventoryTableBody.appendChild(row);
            });

            // Bind delete buttons
            document.querySelectorAll('.delete-prod-btn').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const id = btn.getAttribute('data-id');
                    if (confirm('Are you sure you want to delete this product?')) {
                        try {
                            const res = await fetch('/api/products/delete', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ id: id })
                            });
                            if (res.ok) loadInventory();
                        } catch (err) {
                            console.error(err);
                        }
                    }
                });
            });

            // Bind edit buttons
            document.querySelectorAll('.edit-prod-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const id = btn.getAttribute('data-id');
                    const name = btn.getAttribute('data-name');
                    const desc = btn.getAttribute('data-desc');
                    const cat = btn.getAttribute('data-cat');
                    const price = btn.getAttribute('data-price');
                    const stock = btn.getAttribute('data-stock');
                    const pub = btn.getAttribute('data-pub') === 'true';

                    // Switch form to edit mode
                    editProductId.value = id;
                    document.getElementById('productName').value = name;
                    document.getElementById('productDescription').value = desc;
                    document.getElementById('productCategory').value = cat;
                    document.getElementById('productPrice').value = price;
                    document.getElementById('productStock').value = stock;
                    document.getElementById('productPublished').value = pub ? 'true' : 'false';

                    productFormTitle.textContent = 'Edit Product Details';
                    productSubmitBtn.textContent = 'Update Product';
                    cancelEditBtn.style.display = 'inline-block';
                    
                    // Smooth scroll product form into view if needed
                    productForm.scrollIntoView({ behavior: 'smooth' });
                });
            });
        } catch (e) {
            inventoryTableBody.innerHTML = '<tr><td colspan="5" class="helper">Error loading inventory.</td></tr>';
        }
    };

    // Product Add/Edit Form submission
    if (productForm) {
        productForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = new FormData(productForm);
            const payload = Object.fromEntries(formData.entries());
            const id = editProductId.value;
            
            const endpoint = id ? '/api/products/edit' : '/api/products';
            if (productMessage) productMessage.textContent = 'Saving product…';
            
            try {
                const response = await fetch(endpoint, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                const result = await response.json();
                if (!response.ok) throw new Error(result.error);

                if (productMessage) {
                    productMessage.className = 'helper helper-success';
                    productMessage.textContent = result.message || 'Product saved successfully!';
                }
                resetProductForm();
                loadInventory();
                setTimeout(() => { if (productMessage) productMessage.textContent = ''; }, 3000);
            } catch (err) {
                if (productMessage) {
                    productMessage.className = 'helper helper-error';
                    productMessage.textContent = err.message;
                }
            }
        });
    }

    // Cancel edit button click
    if (cancelEditBtn) {
        cancelEditBtn.addEventListener('click', () => {
            resetProductForm();
        });
    }

    const resetProductForm = () => {
        if (!productForm) return;
        productForm.reset();
        editProductId.value = '';
        productFormTitle.textContent = 'Post a New Product';
        productSubmitBtn.textContent = 'Add Product';
        cancelEditBtn.style.display = 'none';
        if (productMessage) productMessage.textContent = '';
    };

    // Load customer contact care inquiries
    const loadInquiries = async () => {
        if (!inquiriesListContainer) return;
        try {
            const response = await fetch('/api/contact');
            const result = await response.json();
            inquiriesListContainer.innerHTML = '';
            
            const messages = result.messages || [];
            if (!messages.length) {
                inquiriesListContainer.innerHTML = '<p class="helper">No contact inquiries in inbox.</p>';
                return;
            }

            messages.forEach(msg => {
                const div = document.createElement('article');
                div.className = 'inquiry-item';
                div.innerHTML = `
                    <div class="inquiry-header">
                        <span class="inquiry-name">${msg.name} (${msg.email})</span>
                        <span>${msg.createdAt.split(' ')[0]}</span>
                    </div>
                    <p class="inquiry-msg">${msg.message}</p>
                `;
                inquiriesListContainer.appendChild(div);
            });
        } catch (e) {
            inquiriesListContainer.innerHTML = '<p class="helper">Error loading support messages inbox.</p>';
        }
    };

    // --- Contact Support Form Submit (Public Page) ---
    if (contactForm) {
        contactForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = new FormData(contactForm);
            const payload = Object.fromEntries(formData.entries());
            if (contactMessage) contactMessage.textContent = 'Sending message…';

            try {
                const response = await fetch('/api/contact', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                const result = await response.json();
                if (!response.ok) throw new Error(result.error);

                if (contactMessage) {
                    contactMessage.className = 'helper helper-success';
                    contactMessage.textContent = result.message || 'Message sent successfully!';
                }
                contactForm.reset();
                setTimeout(() => { if (contactMessage) contactMessage.textContent = ''; }, 5000);
            } catch (err) {
                if (contactMessage) {
                    contactMessage.className = 'helper helper-error';
                    contactMessage.textContent = err.message;
                }
            }
        });
    }

    // --- Public Products Grid Display ---
    const renderPublicProducts = (products, container) => {
        if (!container) return;
        container.innerHTML = '';
        if (!products.length) {
            container.innerHTML = '<p class="helper">No products are currently published.</p>';
            return;
        }
        products.forEach(product => {
            const article = document.createElement('article');
            article.className = 'card';
            article.innerHTML = `
                <h3>${product.name}</h3>
                <p>${product.description}</p>
                <p class="helper" style="font-weight: 500;">Category: ${product.category}</p>
                <p class="helper" style="color: var(--primary-light); font-weight: 600;">Stock: ${product.stock}</p>
            `;
            container.appendChild(article);
        });
    };

    if (productGrid) {
        fetch('/api/products')
            .then(res => res.json())
            .then(result => {
                if (result.products) {
                    renderPublicProducts(result.products, productGrid);
                }
            })
            .catch(() => {
                productGrid.innerHTML = '<p class="helper">Unable to load products right now. Please try again later.</p>';
            });
    }

    // Execute session checks
    checkSession();
});