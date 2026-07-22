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
    const mpesaPhone = document.getElementById('mpesaPhone');

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

    // Check payment redirect result in URL params
    const checkPaymentRedirect = () => {
        const urlParams = new URLSearchParams(window.location.search);
        const paymentStatus = urlParams.get('payment');
        if (paymentStatus === 'success') {
            alert('Payment successful! Your order has been updated.');
            window.history.replaceState({}, document.title, window.location.pathname);
        } else if (paymentStatus === 'cancelled') {
            alert('Payment was cancelled.');
            window.history.replaceState({}, document.title, window.location.pathname);
        } else if (paymentStatus === 'failed') {
            alert('Payment failed. Please try again.');
            window.history.replaceState({}, document.title, window.location.pathname);
        }
    };
    checkPaymentRedirect();

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

    let pollingInterval = null;

    const startPollingPaymentStatus = (orderId, submitBtn) => {
        if (pollingInterval) clearInterval(pollingInterval);
        
        pollingInterval = setInterval(async () => {
            try {
                const response = await fetch(`/api/payments/status?orderId=${orderId}`);
                const result = await response.json();
                
                if (result.status === 'Paid') {
                    clearInterval(pollingInterval);
                    if (paymentMessage) {
                        paymentMessage.className = 'helper helper-success';
                        paymentMessage.textContent = 'Payment successful! Updating orders…';
                    }
                    setTimeout(() => {
                        if (paymentModal) paymentModal.style.display = 'none';
                        if (submitBtn) submitBtn.disabled = false;
                        paymentForm.reset();
                        loadCustomerOrders();
                    }, 1500);
                } else if (result.status === 'Failed') {
                    clearInterval(pollingInterval);
                    if (submitBtn) submitBtn.disabled = false;
                    if (paymentMessage) {
                        paymentMessage.className = 'helper helper-error';
                        paymentMessage.textContent = result.error || 'Payment failed. Please try again.';
                    }
                }
            } catch (err) {
                console.error('Error polling payment status:', err);
            }
        }, 3000);
    };

    // Handle payment form submission
    if (paymentForm) {
        paymentForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const orderId = paymentTargetOrderId.value;
            const method = paymentMethod.value;
            const submitBtn = document.getElementById('submitPaymentBtn');
            
            if (submitBtn) submitBtn.disabled = true;
            if (paymentMessage) {
                paymentMessage.className = 'helper';
                paymentMessage.textContent = 'Initiating transaction…';
            }

            const payload = {
                orderId: orderId,
                method: method
            };

            if (method === 'mpesa') {
                if (mpesaPhone) {
                    payload.phone = mpesaPhone.value;
                }
            }

            try {
                const response = await fetch('/api/payments/initiate', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                const result = await response.json();
                if (!response.ok) throw new Error(result.error || 'Failed to initiate payment');

                if (method === 'mpesa') {
                    if (paymentMessage) {
                        paymentMessage.className = 'helper helper-success';
                        paymentMessage.textContent = result.message || 'STK Push sent! Please enter your PIN on your phone.';
                    }
                    startPollingPaymentStatus(orderId, submitBtn);
                } else if (method === 'card') {
                    if (paymentMessage) {
                        paymentMessage.className = 'helper helper-success';
                        paymentMessage.textContent = 'Redirecting to Stripe secure checkout page…';
                    }
                    setTimeout(() => {
                        window.location.href = result.checkoutUrl;
                    }, 1000);
                }
            } catch (err) {
                if (submitBtn) submitBtn.disabled = false;
                if (paymentMessage) {
                    paymentMessage.className = 'helper helper-error';
                    paymentMessage.textContent = err.message || 'Payment initiation failed.';
                }
            }
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
                inventoryTableBody.innerHTML = '<tr><td colspan="6" class="helper">No products in inventory.</td></tr>';
                return;
            }

            products.forEach(prod => {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td><strong>${prod.name}</strong><br><span class="helper" style="font-size: 0.8rem;">${prod.description.substring(0, 50)}…</span></td>
                    <td>${prod.price}</td>
                    <td><span style="color:#F5B942;font-weight:600;">${prod.buyingPrice || '—'}</span></td>
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
                                    data-buying="${prod.buyingPrice || ''}" 
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
                    const buying = btn.getAttribute('data-buying');
                    const stock = btn.getAttribute('data-stock');
                    const pub = btn.getAttribute('data-pub') === 'true';

                    // Switch form to edit mode
                    editProductId.value = id;
                    document.getElementById('productName').value = name;
                    document.getElementById('productDescription').value = desc;
                    document.getElementById('productCategory').value = cat;
                    document.getElementById('productPrice').value = price;
                    const buyingEl = document.getElementById('productBuyingPrice');
                    if (buyingEl) buyingEl.value = buying;
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
            inventoryTableBody.innerHTML = '<tr><td colspan="6" class="helper">Error loading inventory.</td></tr>';
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

// ============================================================
// DELIVERIES PORTAL — runs only on deliveries.html
// ============================================================
(function () {
    if (!document.getElementById('deliveryLoginForm')) return;

    // ---- State ----
    let deliveryUser = null;
    let pendingCompleteOrderId = null;

    // ---- DOM refs ----
    const authView       = document.getElementById('deliveryAuthView');
    const dashView       = document.getElementById('deliveryDashboardView');
    const loginForm      = document.getElementById('deliveryLoginForm');
    const loginMsg       = document.getElementById('deliveryAuthMessage');
    const navActions     = document.getElementById('deliveryNavActions');
    const agentNameEl    = document.getElementById('deliveryManName');
    const logoutBtn      = document.getElementById('deliveryLogoutBtn');
    const availableList  = document.getElementById('availableDeliveriesList');
    const activeList     = document.getElementById('activeDeliveriesList');
    const completedList  = document.getElementById('completedDeliveriesList');
    const availCount     = document.getElementById('availableCount');
    const activeCount    = document.getElementById('activeCount');

    // ---- Signature modal ----
    const sigModal       = document.getElementById('signatureModal');
    const closeSigModal  = document.getElementById('closeSignatureModal');
    const clearSigBtn    = document.getElementById('clearSignatureBtn');
    const submitSigBtn   = document.getElementById('submitDeliveryBtn');
    const sigCanvas      = document.getElementById('signatureCanvas');
    const sigMsg         = document.getElementById('signatureMessage');
    const sigCustName    = document.getElementById('sigCustomerName');
    const sigProdDet     = document.getElementById('sigProductDetails');

    // ---- Canvas drawing ----
    let isDrawing = false;
    let ctx;
    if (sigCanvas) {
        ctx = sigCanvas.getContext('2d');
        ctx.strokeStyle = '#0A192F';
        ctx.lineWidth = 2.5;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        const getPos = (e) => {
            const rect = sigCanvas.getBoundingClientRect();
            const scaleX = sigCanvas.width / rect.width;
            const scaleY = sigCanvas.height / rect.height;
            const src = e.touches ? e.touches[0] : e;
            return {
                x: (src.clientX - rect.left) * scaleX,
                y: (src.clientY - rect.top) * scaleY
            };
        };

        const startDraw = (e) => { e.preventDefault(); isDrawing = true; const p = getPos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); };
        const draw = (e) => { e.preventDefault(); if (!isDrawing) return; const p = getPos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); };
        const stopDraw = () => { isDrawing = false; };

        sigCanvas.addEventListener('mousedown', startDraw);
        sigCanvas.addEventListener('mousemove', draw);
        sigCanvas.addEventListener('mouseup', stopDraw);
        sigCanvas.addEventListener('mouseleave', stopDraw);
        sigCanvas.addEventListener('touchstart', startDraw, { passive: false });
        sigCanvas.addEventListener('touchmove', draw, { passive: false });
        sigCanvas.addEventListener('touchend', stopDraw);
    }

    const clearCanvas = () => {
        if (ctx) ctx.clearRect(0, 0, sigCanvas.width, sigCanvas.height);
    };

    if (clearSigBtn) clearSigBtn.addEventListener('click', clearCanvas);
    if (closeSigModal) closeSigModal.addEventListener('click', () => { sigModal.style.display = 'none'; pendingCompleteOrderId = null; });

    // ---- Tab switching ----
    document.querySelectorAll('.tab-link').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-link').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            btn.classList.add('active');
            const target = document.getElementById(btn.dataset.tab);
            if (target) target.classList.add('active');
        });
    });

    // ---- Auth ----
    const showDashboard = (user) => {
        deliveryUser = user;
        if (authView) authView.style.display = 'none';
        if (dashView) dashView.style.display = 'block';
        if (navActions) navActions.style.display = 'flex';
        if (agentNameEl) agentNameEl.textContent = user.name;
        loadAllDeliveries();
    };

    // Check if already logged in
    fetch('/api/me').then(r => r.json()).then(res => {
        if (res.authenticated && res.user.role === 'delivery') {
            showDashboard(res.user);
        }
    }).catch(() => {});

    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (loginMsg) { loginMsg.className = 'helper'; loginMsg.textContent = 'Signing in…'; }
            const email    = document.getElementById('deliveryEmail').value.trim();
            const password = document.getElementById('deliveryPassword').value;
            try {
                const res = await fetch('/api/auth', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ mode: 'login', email, password })
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'Login failed');
                if (data.user.role !== 'delivery') throw new Error('This portal is for delivery agents only.');
                showDashboard(data.user);
            } catch (err) {
                if (loginMsg) { loginMsg.className = 'helper helper-error'; loginMsg.textContent = err.message; }
            }
        });
    }

    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
            window.location.reload();
        });
    }

    // ---- Load all tabs ----
    const loadAllDeliveries = () => {
        loadAvailable();
        loadActive();
        loadCompleted();
    };

    const deliveryCard = (d, actions = '') => `
        <div class="delivery-card">
            <h4>
                <span>Order #${d.id} — ${d.product}</span>
                <span class="status-badge">${d.status}</span>
            </h4>
            <div class="delivery-meta">
                <span><strong>Customer:</strong> ${d.customerName}</span>
                <span><strong>Phone:</strong> ${d.customerPhone}</span>
                <span><strong>Qty:</strong> ${d.quantity}</span>
                <span><strong>Date:</strong> ${(d.createdAt || '').split(' ')[0]}</span>
            </div>
            ${d.message ? `<div class="delivery-message">📝 ${d.message}</div>` : ''}
            ${actions}
        </div>`;

    const loadAvailable = async () => {
        if (!availableList) return;
        availableList.innerHTML = '<div class="delivery-card" style="text-align:center;"><p class="helper">Loading…</p></div>';
        try {
            const res = await fetch('/api/deliveries/available');
            const data = await res.json();
            const items = data.deliveries || [];
            if (availCount) availCount.textContent = items.length;
            if (!items.length) {
                availableList.innerHTML = '<div class="delivery-card" style="text-align:center;padding:2rem;"><p class="helper">No deliveries available right now. Check back soon!</p></div>';
                return;
            }
            availableList.innerHTML = items.map(d => deliveryCard(d,
                `<button class="btn btn-primary btn-full accept-btn" data-id="${d.id}">Accept Delivery</button>`
            )).join('');
            availableList.querySelectorAll('.accept-btn').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const orderId = btn.getAttribute('data-id');
                    btn.disabled = true;
                    btn.textContent = 'Accepting…';
                    try {
                        const r = await fetch('/api/deliveries/accept', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ orderId: parseInt(orderId) })
                        });
                        const d = await r.json();
                        if (!r.ok) throw new Error(d.error);
                        loadAllDeliveries();
                    } catch (err) {
                        btn.disabled = false;
                        btn.textContent = 'Accept Delivery';
                        alert('Error: ' + err.message);
                    }
                });
            });
        } catch (e) {
            availableList.innerHTML = '<div class="delivery-card"><p class="helper helper-error">Error loading available deliveries.</p></div>';
        }
    };

    const loadActive = async () => {
        if (!activeList) return;
        activeList.innerHTML = '<div class="delivery-card" style="text-align:center;"><p class="helper">Loading…</p></div>';
        try {
            const res = await fetch('/api/deliveries/my-active');
            const data = await res.json();
            const items = data.deliveries || [];
            if (activeCount) activeCount.textContent = items.length;
            if (!items.length) {
                activeList.innerHTML = '<div class="delivery-card" style="text-align:center;padding:2rem;"><p class="helper">You have no active deliveries in transit.</p></div>';
                return;
            }
            activeList.innerHTML = items.map(d => deliveryCard(d,
                `<button class="btn btn-primary btn-full complete-btn" data-id="${d.id}" data-name="${d.customerName}" data-product="${d.product} (${d.quantity})">Mark as Delivered</button>`
            )).join('');
            activeList.querySelectorAll('.complete-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    pendingCompleteOrderId = btn.getAttribute('data-id');
                    if (sigCustName) sigCustName.textContent = btn.getAttribute('data-name');
                    if (sigProdDet) sigProdDet.textContent = btn.getAttribute('data-product');
                    clearCanvas();
                    if (sigMsg) sigMsg.textContent = '';
                    if (sigModal) sigModal.style.display = 'flex';
                });
            });
        } catch (e) {
            activeList.innerHTML = '<div class="delivery-card"><p class="helper helper-error">Error loading active deliveries.</p></div>';
        }
    };

    const loadCompleted = async () => {
        if (!completedList) return;
        completedList.innerHTML = '<div class="delivery-card" style="text-align:center;"><p class="helper">Loading…</p></div>';
        try {
            const res = await fetch('/api/deliveries/completed');
            const data = await res.json();
            const items = data.deliveries || [];
            if (!items.length) {
                completedList.innerHTML = '<div class="delivery-card" style="text-align:center;padding:2rem;"><p class="helper">No completed deliveries yet.</p></div>';
                return;
            }
            completedList.innerHTML = items.map(d => {
                const sigPreview = d.signature
                    ? `<div style="margin-top:0.75rem;"><p style="font-size:0.8rem;color:var(--text-muted);margin-bottom:0.25rem;">Customer Signature:</p><img class="signature-img-preview" src="${d.signature}" alt="Signature"></div>`
                    : '';
                return deliveryCard(d, `<span class="tag paid" style="font-size:0.8rem;">✓ Delivered</span>${sigPreview}`);
            }).join('');
        } catch (e) {
            completedList.innerHTML = '<div class="delivery-card"><p class="helper helper-error">Error loading history.</p></div>';
        }
    };

    // ---- Signature submit ----
    if (submitSigBtn) {
        submitSigBtn.addEventListener('click', async () => {
            if (!pendingCompleteOrderId) return;
            // Check canvas has ink
            const blank = !ctx.getImageData(0, 0, sigCanvas.width, sigCanvas.height).data.some(v => v !== 0);
            if (blank) {
                if (sigMsg) { sigMsg.className = 'helper helper-error'; sigMsg.textContent = 'Please have the customer sign above before confirming.'; }
                return;
            }
            const signature = sigCanvas.toDataURL('image/png');
            submitSigBtn.disabled = true;
            submitSigBtn.textContent = 'Submitting…';
            if (sigMsg) { sigMsg.className = 'helper'; sigMsg.textContent = 'Completing delivery and sending notifications…'; }
            try {
                const r = await fetch('/api/deliveries/complete', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ orderId: parseInt(pendingCompleteOrderId), signature })
                });
                const d = await r.json();
                if (!r.ok) throw new Error(d.error);
                if (sigMsg) { sigMsg.className = 'helper helper-success'; sigMsg.textContent = '✓ Delivery confirmed! Emails sent to buyer and admin.'; }
                setTimeout(() => {
                    sigModal.style.display = 'none';
                    pendingCompleteOrderId = null;
                    submitSigBtn.disabled = false;
                    submitSigBtn.textContent = 'Confirm handover & notify';
                    loadAllDeliveries();
                }, 2200);
            } catch (err) {
                submitSigBtn.disabled = false;
                submitSigBtn.textContent = 'Confirm handover & notify';
                if (sigMsg) { sigMsg.className = 'helper helper-error'; sigMsg.textContent = err.message; }
            }
        });
    }
}());