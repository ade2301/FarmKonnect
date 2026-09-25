(function () {
  'use strict';

  const CART_KEY = 'farmkonnect_cart_v1';
  const ORDERS_KEY = 'farmkonnect_orders_v1';
  const CATALOG_KEY = 'farmkonnect_catalog_v1';
  const PENDING_ACTION_KEY = 'farmkonnect_pending_marketplace_action';
  const ADMIN_PAYMENT_DETAILS = {
    bankName: 'OPAY',
    accountName: 'Ojurereoluwa Adeniyi Ademola',
    accountNumber: '7067110127 '
  };
  const currency = new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 });

  const initialCatalog = {
    suppliers: [{
      id: 'admin-supplier',
      name: 'Admin',
      role: 'delivery-admin',
      photo: 'assets/logo.png',
      location: 'FarmKonnect distribution hub',
      joinedAt: '2025-01-01T00:00:00.000Z',
      deliveryScore: 1000,
      averageRating: null,
      ordersFulfilled: 0
    }],
    products: [
      { id: 'admin-tomatoes', name: 'Tomatoes', description: 'Locally grown, juicy and ripe.', price: 1200, originalPrice: 1200, stock: 100, approvalStatus: 'approved', unit: 'kg', image: 'assets/produce-tomatoes.jpg', supplierId: 'admin-supplier', featured: true },
      { id: 'admin-yam', name: 'Yam', description: 'Rich, starchy, and satisfying.', price: 900, originalPrice: 900, stock: 100, approvalStatus: 'approved', unit: 'tuber', image: 'assets/produce-yam.jpg', supplierId: 'admin-supplier', featured: true },
      { id: 'admin-peppers', name: 'Peppers', description: 'A spicy kick, sustainably grown.', price: 1000, originalPrice: 1000, stock: 100, approvalStatus: 'approved', unit: 'kg', image: 'assets/produce-pepper.jpg', supplierId: 'admin-supplier', featured: true },
      { id: 'admin-plantain', name: 'Plantain', description: 'Perfect for boiling, frying, or roasting.', price: 700, originalPrice: 700, stock: 100, approvalStatus: 'approved', unit: 'bunch', image: 'assets/produce-plantain.jpg', supplierId: 'admin-supplier', featured: false },
      { id: 'admin-spinach', name: 'Spinach', description: 'Leafy greens packed with nutrients.', price: 500, originalPrice: 500, stock: 100, approvalStatus: 'approved', unit: 'bundle', image: 'assets/produce-spinach.jpg', supplierId: 'admin-supplier', featured: false },
      { id: 'admin-carrots', name: 'Carrots', description: 'Crunchy and sweet, great for everything.', price: 1100, originalPrice: 1100, stock: 100, approvalStatus: 'approved', unit: 'kg', image: 'assets/produce-carrots.jpg', supplierId: 'admin-supplier', featured: false }
    ]
  };

  function read(key, fallback) {
    try {
      return JSON.parse(localStorage.getItem(key)) || fallback;
    } catch (error) {
      return fallback;
    }
  }

  function save(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function getCatalog() {
    const catalog = read(CATALOG_KEY, null);
    if (catalog && Array.isArray(catalog.suppliers) && Array.isArray(catalog.products)) {
      let changed = false;
      if (!catalog.suppliers.some(function (supplier) { return supplier.id === 'admin-supplier'; })) {
        catalog.suppliers.push(initialCatalog.suppliers[0]);
        changed = true;
      }
      catalog.products.forEach(function (product) {
        if (product.supplierId === 'admin-supplier') {
          if (!Number.isInteger(product.stock)) { product.stock = 100; changed = true; }
          if (!product.approvalStatus) { product.approvalStatus = 'approved'; changed = true; }
          if (!Number.isFinite(product.originalPrice)) { product.originalPrice = product.price; changed = true; }
        }
      });
      if (changed) save(CATALOG_KEY, catalog);
      return catalog;
    }
    save(CATALOG_KEY, initialCatalog);
    return initialCatalog;
  }

  function currentSession() {
    return window.FarmKonnectAuth && window.FarmKonnectAuth.getCurrentSession
      ? window.FarmKonnectAuth.getCurrentSession()
      : null;
  }

  function isConsumer() {
    const session = currentSession();
    return Boolean(session && session.role === 'consumer');
  }

  function savePendingAction(action) {
    save(PENDING_ACTION_KEY, Object.assign(action, { returnTo: window.location.pathname + window.location.search }));
  }

  function requireConsumer(action) {
    if (isConsumer()) return true;
    savePendingAction(action);
    notify('Log in as a consumer to start shopping.', 'warning');
    window.setTimeout(function () { window.location.href = 'login.html'; }, 500);
    return false;
  }

  function escapeHtml(value) {
    return String(value || '').replace(/[&<>'"]/g, function (character) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character];
    });
  }

  function readProductImage(file) {
    return new Promise(function (resolve, reject) {
      if (!file) {
        reject(new Error('Please upload a product image.'));
        return;
      }
      if (!file.type || file.type.indexOf('image/') !== 0) {
        reject(new Error('Product image must be a JPG, PNG, WEBP, or GIF file.'));
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        reject(new Error('Product image must be 5 MB or smaller.'));
        return;
      }
      const reader = new FileReader();
      reader.onload = function () { resolve(reader.result); };
      reader.onerror = function () { reject(new Error('The product image could not be read.')); };
      reader.readAsDataURL(file);
    });
  }

  function cart() {
    return read(CART_KEY, []);
  }

  function total(items) {
    return items.reduce(function (sum, item) { return sum + item.price * item.quantity; }, 0);
  }

  function productFromButton(button) {
    const product = getCatalog().products.find(function (entry) { return entry.id === button.dataset.productId; });
    if (product) return product;
    return {
      id: button.dataset.product,
      name: button.dataset.product,
      price: Number(button.dataset.price),
      unit: button.dataset.unit || 'unit',
      image: button.dataset.image || '',
      category: button.dataset.category || 'Produce'
    };
  }

  function notify(message, type) {
    let toast = document.getElementById('marketplaceToast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'marketplaceToast';
      toast.className = 'marketplace-toast';
      document.body.appendChild(toast);
    }
    toast.className = 'marketplace-toast ' + (type || '');
    toast.textContent = message;
    toast.classList.add('is-visible');
    window.setTimeout(function () { toast.classList.remove('is-visible'); }, 2600);
  }

  function updateCount() {
    const count = cart().reduce(function (sum, item) { return sum + item.quantity; }, 0);
    document.querySelectorAll('[data-cart-count]').forEach(function (badge) {
      badge.textContent = count;
      badge.classList.toggle('d-none', count === 0);
    });
  }

  function renderCart() {
    const items = cart();
    const list = document.getElementById('cartItems');
    const empty = document.getElementById('cartEmpty');
    const summary = document.getElementById('cartSummary');
    const checkout = document.getElementById('checkoutButton');
    if (!list) return;

    list.innerHTML = '';
    empty.classList.toggle('d-none', items.length > 0);
    summary.classList.toggle('d-none', items.length === 0);
    checkout.disabled = items.length === 0;

    items.forEach(function (item) {
      const row = document.createElement('div');
      row.className = 'cart-line';
      row.innerHTML = '<img src="' + item.image + '" alt="" class="cart-line-image">' +
        '<div class="flex-grow-1"><div class="d-flex justify-content-between gap-2"><strong>' + item.name + '</strong><strong>' + currency.format(item.price * item.quantity) + '</strong></div>' +
        '<small class="text-secondary">' + currency.format(item.price) + ' / ' + item.unit + '</small>' +
        '<div class="quantity-control mt-2" aria-label="Quantity for ' + item.name + '"><button type="button" data-cart-decrease="' + item.id + '" aria-label="Decrease quantity">−</button><span>' + item.quantity + '</span><button type="button" data-cart-increase="' + item.id + '" aria-label="Increase quantity">+</button><button type="button" class="remove-item ms-2" data-cart-remove="' + item.id + '">Remove</button></div></div>';
      list.appendChild(row);
    });
    document.getElementById('cartSubtotal').textContent = currency.format(total(items));
    document.getElementById('cartTotal').textContent = currency.format(total(items) + (items.length ? 1500 : 0));
    updateCount();
  }

  function openCart() {
    if (!requireConsumer({ type: 'open-cart' })) return;
    renderCart();
    const modal = document.getElementById('cartModal');
    if (window.bootstrap && modal) window.bootstrap.Modal.getOrCreateInstance(modal).show();
  }

  function addToCart(product) {
    if (!requireConsumer({ type: 'add-to-cart', productId: product.id })) return;
    const items = cart();
    const existing = items.find(function (item) { return item.id === product.id; });
    if (Number.isInteger(product.stock) && existing && existing.quantity >= product.stock) {
      notify('That listing is out of stock or at its cart limit.', 'warning');
      return;
    }
    if (existing) existing.quantity += 1;
    else items.push(Object.assign({}, product, { quantity: 1 }));
    save(CART_KEY, items);
    updateCount();
    notify(product.name + ' added to your basket.', 'success');
  }

  function changeQuantity(id, delta) {
    const items = cart();
    const item = items.find(function (entry) { return entry.id === id; });
    if (!item) return;
    item.quantity = Math.max(0, item.quantity + delta);
    save(CART_KEY, items.filter(function (entry) { return entry.quantity > 0; }));
    renderCart();
  }

  function checkout() {
    const items = cart();
    if (!items.length) return;
    const session = currentSession();
    if (!session || session.role !== 'consumer') return;
    const address = document.getElementById('deliveryAddress');
    if (!address || !address.value.trim()) {
      notify('Add a delivery address before placing your order.', 'warning');
      return;
    }
    const catalog = getCatalog();
    for (let index = 0; index < items.length; index += 1) {
      const listing = catalog.products.find(function (product) { return product.id === items[index].id; });
      if (listing && Number.isInteger(listing.stock) && items[index].quantity > listing.stock) {
        notify(listing.name + ' no longer has enough stock.', 'warning');
        return;
      }
    }
    save(CATALOG_KEY, catalog);
    const paymentReference = document.getElementById('paymentReference');
    if (!paymentReference || !paymentReference.value.trim()) {
      notify('Enter your transfer reference after making payment.', 'warning');
      return;
    }
    const order = { id: 'FK-' + Date.now().toString().slice(-6), consumerId: session.userId, deliveryAddress: address.value.trim().slice(0, 240), items: items, total: total(items) + 1500, createdAt: new Date().toISOString(), status: 'Payment pending', paymentStatus: 'submitted', paymentReference: paymentReference.value.trim().slice(0, 100) };
    const orders = read(ORDERS_KEY, []);
    orders.unshift(order);
    save(ORDERS_KEY, orders.slice(0, 20));
    save(CART_KEY, []);
    renderCart();
    document.getElementById('checkoutForm').classList.add('d-none');
    document.getElementById('orderConfirmation').classList.remove('d-none');
    document.getElementById('orderNumber').textContent = '#' + order.id;
  }

  function supplierFor(product) {
    return getCatalog().suppliers.find(function (supplier) { return supplier.id === product.supplierId; }) || null;
  }

  function productCard(product, delay) {
    const supplier = supplierFor(product);
    return '<div class="col-12 col-sm-6 col-lg-4" data-produce-card data-dashboard-product data-category="' + escapeHtml(product.category) + '" data-product-name="' + escapeHtml(product.name) + '">' +
      '<article class="card h-100" data-aos="flip-left" data-aos-delay="' + delay + '">' +
      '<img src="' + escapeHtml(product.image) + '" class="card-img-top" alt="' + escapeHtml(product.name) + '" loading="lazy" />' +
      '<div class="card-body d-flex flex-column"><div><h5 class="card-title">' + escapeHtml(product.name) + '</h5>' +
      '<p class="text-secondary mb-2">' + escapeHtml(product.description) + '</p>' +
      '<button type="button" class="btn btn-link p-0 text-ojaya small farmer-profile-link" data-farmer-profile="' + escapeHtml(product.supplierId) + '">Listed by ' + escapeHtml(supplier ? supplier.name : 'Admin') + '</button></div>' +
      '<div class="d-flex justify-content-between align-items-center mt-auto pt-3"><span class="price fw-bold text-ojaya">' + currency.format(product.price) + '/' + escapeHtml(product.unit) + '</span>' +
      '<button type="button" class="btn btn-outline-ojaya btn-sm" data-product-id="' + escapeHtml(product.id) + '">Add to Cart</button></div></div></article></div>';
  }

  function farmerProductCard(product, delay) {
    const stock = Number.isInteger(product.stock) ? product.stock : 0;
    const stockClass = stock === 0 ? 'text-danger' : stock < 10 ? 'text-warning' : 'text-success';
    const approval = product.approvalStatus === 'pending' ? '<span class="status-pill warning">Awaiting Admin approval</span>' : product.approvalStatus === 'rejected' ? '<span class="status-pill danger">Rejected</span>' : '<span class="status-pill success">Approved</span>';
    return '<div class="col-12 col-md-6" data-dashboard-product="' + escapeHtml(product.id) + '"><article class="card h-100" data-aos="flip-left" data-aos-delay="' + delay + '"><img src="' + escapeHtml(product.image) + '" class="card-img-top" alt="' + escapeHtml(product.name) + '" loading="lazy" /><div class="card-body"><div class="d-flex justify-content-between align-items-start gap-2"><div><h5 class="card-title mb-1">' + escapeHtml(product.name) + '</h5><p class="text-secondary small mb-2">' + escapeHtml(product.description) + '</p></div><span class="small fw-semibold ' + stockClass + '">' + (stock === 0 ? 'Out of stock' : stock + ' available') + '</span></div><div class="d-flex flex-wrap gap-2 align-items-center mb-3">' + approval + '<span class="small text-secondary">Original: ' + currency.format(product.originalPrice || product.price) + ' / ' + escapeHtml(product.unit) + '</span></div><p class="price fw-bold text-ojaya mb-3">' + currency.format(product.price) + ' / ' + escapeHtml(product.unit) + '</p><div class="input-group input-group-sm mb-2"><span class="input-group-text">Stock</span><input class="form-control farmer-stock-input" type="number" min="0" step="1" value="' + stock + '" data-stock-product="' + escapeHtml(product.id) + '"><button class="btn btn-outline-ojaya" type="button" data-save-stock="' + escapeHtml(product.id) + '">Save</button></div><div class="d-flex justify-content-between align-items-center"><span class="small text-secondary">' + (stock === 0 ? 'Hidden from shoppers' : 'Visible in marketplace') + '</span><button type="button" class="btn btn-sm btn-outline-danger" data-delete-product="' + escapeHtml(product.id) + '"><i class="bi bi-trash3 me-1"></i>Delete</button></div></div></article></div>';
  }

  function productCollectionMarkup(products, cardRenderer, limit, buttonId) {
    const cards = products.map(function (product, index) {
      const hidden = index >= limit ? ' product-card-extra d-none' : '';
      return cardRenderer(product, index * 60).replace('<div ', '<div data-product-order="' + index + '" ').replace('class="', 'class="' + (hidden ? hidden.trim().slice(1) + ' ' : ''));
    }).join('');
    const moreButton = products.length > limit ? '<div class="col-12 text-center mt-3"><button type="button" class="btn btn-outline-ojaya" id="' + buttonId + '" data-see-more="' + buttonId + '">See more products</button></div>' : '';
    return cards + moreButton;
  }

  function bindSeeMore(container) {
    const button = container.querySelector('[data-see-more]');
    if (!button) return;
    button.addEventListener('click', function () {
      container.querySelectorAll('.product-card-extra').forEach(function (card) { card.classList.remove('d-none', 'product-card-extra'); });
      button.remove();
    });
  }

  function renderEmptyState(mount) {
    mount.innerHTML = '<div class="col-12"><div class="empty-catalog text-center py-5"><i class="bi bi-basket2 display-5 text-ojaya"></i><h4 class="h5 fw-bold mt-3">No products yet</h4><p class="text-secondary mb-3">Check back soon as farmers join FarmKonnect.</p><a class="btn btn-ojaya" href="signup.html#farmer">Join as a Farmer</a></div></div>';
  }

  function renderProducts() {
    const catalog = getCatalog();
    const homeMount = document.getElementById('homeProductGrid');
    const produceMount = document.getElementById('produceProductGrid');
    const seasonalMount = document.getElementById('seasonalProductGrid');
    const products = catalog.products.filter(function (product) {
      return product.stock !== 0 && product.approvalStatus !== 'pending' && product.approvalStatus !== 'rejected' && catalog.suppliers.some(function (supplier) { return supplier.id === product.supplierId; });
    });

    if (homeMount) {
      if (products.length) { homeMount.innerHTML = productCollectionMarkup(products, productCard, 6, 'homeSeeMore'); bindSeeMore(homeMount); }
      else renderEmptyState(homeMount);
    }
    if (produceMount) {
      const featured = products.filter(function (product) { return product.featured; });
      if (featured.length) { produceMount.innerHTML = productCollectionMarkup(featured, productCard, 6, 'featuredSeeMore'); bindSeeMore(produceMount); }
      else renderEmptyState(produceMount);
    }
    if (seasonalMount) {
      const seasonal = products.filter(function (product) { return !product.featured; });
      if (seasonal.length) { seasonalMount.innerHTML = productCollectionMarkup(seasonal, productCard, 6, 'seasonalSeeMore'); bindSeeMore(seasonalMount); }
      else renderEmptyState(seasonalMount);
    }
  }

  function showSupplierProfile(supplierId) {
    const catalog = getCatalog();
    const supplier = catalog.suppliers.find(function (entry) { return entry.id === supplierId; });
    if (!supplier) return;
    const productCount = catalog.products.filter(function (product) { return product.supplierId === supplier.id; }).length;
    const profile = document.getElementById('supplierProfileModal');
    profile.querySelector('[data-profile-name]').textContent = supplier.name;
    profile.querySelector('[data-profile-photo]').src = supplier.photo;
    profile.querySelector('[data-profile-location]').textContent = supplier.location || 'Location not provided';
    profile.querySelector('[data-profile-products]').textContent = productCount;
    profile.querySelector('[data-profile-joined]').textContent = new Date(supplier.joinedAt).toLocaleDateString('en-NG', { month: 'short', year: 'numeric' });
    profile.querySelector('[data-profile-rating]').textContent = supplier.averageRating === null ? 'No reviews yet' : supplier.averageRating.toFixed(1) + '/5';
    profile.querySelector('[data-profile-delivery]').textContent = supplier.deliveryScore + '%';
    window.bootstrap.Modal.getOrCreateInstance(profile).show();
  }

  function getDashboardProducts(session) {
    return getCatalog().products.filter(function (product) {
      return session.role === 'farmer' ? product.supplierId === session.userId : product.stock !== 0 && product.approvalStatus !== 'pending' && product.approvalStatus !== 'rejected';
    });
  }

  function getDashboardOrders(session) {
    return read(ORDERS_KEY, []).filter(function (order) {
      if (session.role === 'farmer') {
        return order.items.some(function (item) { return item.supplierId === session.userId; });
      }
      return order.consumerId === session.userId;
    });
  }

  function addFarmerProduct(session, details) {
    if (!session || session.role !== 'farmer') throw new Error('Only farmer accounts can add products.');
    const product = {
      id: 'product-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7),
      name: String(details.name || '').trim().slice(0, 80),
      description: String(details.description || '').trim().slice(0, 180),
      price: Number(details.price),
      originalPrice: Number(details.originalPrice || details.price),
      stock: Number(details.stock),
      unit: String(details.unit || 'unit').trim().slice(0, 30),
      category: String(details.category || 'Produce').trim().slice(0, 40),
      image: String(details.image || ''),
      supplierId: session.userId,
      approvalStatus: 'pending',
      featured: false,
      createdAt: new Date().toISOString()
    };
    if (!product.name || !product.description || !Number.isFinite(product.price) || product.price <= 0 || !Number.isFinite(product.originalPrice) || product.originalPrice <= 0 || !Number.isInteger(product.stock) || product.stock < 0) {
      throw new Error('Enter original price, selling price, description, and stock quantity.');
    }
    if (!product.image || product.image.indexOf('data:image/') !== 0) {
      throw new Error('Upload a product image before publishing.');
    }
    const catalog = getCatalog();
    catalog.products.push(product);
    if (!catalog.suppliers.some(function (supplier) { return supplier.id === session.userId; })) {
      catalog.suppliers.push({ id: session.userId, name: session.fullName, role: 'farmer', photo: 'assets/logo.png', location: 'Location not provided', joinedAt: session.issuedAt ? new Date(session.issuedAt).toISOString() : new Date().toISOString(), deliveryScore: null, averageRating: null, ordersFulfilled: 0 });
    }
    save(CATALOG_KEY, catalog);
    return product;
  }

  function updateFarmerStock(productId, stock, session) {
    if (!session || session.role !== 'farmer') return false;
    const catalog = getCatalog();
    const product = catalog.products.find(function (entry) { return entry.id === productId && entry.supplierId === session.userId; });
    const quantity = Number(stock);
    if (!product || !Number.isInteger(quantity) || quantity < 0) return false;
    product.stock = quantity;
    product.updatedAt = new Date().toISOString();
    save(CATALOG_KEY, catalog);
    return true;
  }

  function deleteFarmerProduct(productId, session) {
    if (!session || session.role !== 'farmer') return false;
    const catalog = getCatalog();
    const index = catalog.products.findIndex(function (entry) { return entry.id === productId && entry.supplierId === session.userId; });
    if (index < 0) return false;
    catalog.products.splice(index, 1);
    save(CATALOG_KEY, catalog);
    return true;
  }

  function updateOrderStatus(orderId, status, session) {
    const orders = read(ORDERS_KEY, []);
    const order = orders.find(function (entry) { return entry.id === orderId; });
    if (!order || !session || session.role !== 'farmer' || !order.items.some(function (item) { return item.supplierId === session.userId; })) return false;
    order.status = status;
    order.updatedAt = new Date().toISOString();
    save(ORDERS_KEY, orders);
    return true;
  }

  function confirmPayment(orderId, session) {
    if (!session || session.role !== 'admin') return false;
    const orders = read(ORDERS_KEY, []);
    const order = orders.find(function (entry) { return entry.id === orderId; });
    if (!order || order.paymentStatus !== 'submitted') return false;
    const catalog = getCatalog();
    for (let index = 0; index < order.items.length; index += 1) {
      const listing = catalog.products.find(function (product) { return product.id === order.items[index].id; });
      if (!listing || !Number.isInteger(listing.stock) || order.items[index].quantity > listing.stock) return false;
    }
    order.items.forEach(function (item) {
      const listing = catalog.products.find(function (product) { return product.id === item.id; });
      listing.stock -= item.quantity;
    });
    order.paymentStatus = 'confirmed';
    order.status = 'Requested';
    order.paymentConfirmedAt = new Date().toISOString();
    save(CATALOG_KEY, catalog);
    save(ORDERS_KEY, orders);
    return true;
  }

  function getPendingProducts() {
    return getCatalog().products.filter(function (product) { return product.supplierId !== 'admin-supplier' && product.approvalStatus === 'pending'; });
  }

  function approveProduct(productId, sellingPrice, session) {
    if (!session || session.role !== 'admin') return false;
    const catalog = getCatalog();
    const product = catalog.products.find(function (entry) { return entry.id === productId && entry.approvalStatus === 'pending'; });
    const price = Number(sellingPrice);
    if (!product || !Number.isFinite(price) || price <= 0) return false;
    product.price = price;
    product.approvalStatus = 'approved';
    product.approvedAt = new Date().toISOString();
    save(CATALOG_KEY, catalog);
    return true;
  }

  function rejectProduct(productId, session) {
    if (!session || session.role !== 'admin') return false;
    const catalog = getCatalog();
    const product = catalog.products.find(function (entry) { return entry.id === productId && entry.approvalStatus === 'pending'; });
    if (!product) return false;
    product.approvalStatus = 'rejected';
    product.rejectedAt = new Date().toISOString();
    save(CATALOG_KEY, catalog);
    return true;
  }

  function injectSupplierProfileModal() {
    if (document.getElementById('supplierProfileModal')) return;
    document.body.insertAdjacentHTML('beforeend', '<div class="modal fade" id="supplierProfileModal" tabindex="-1" aria-labelledby="supplierProfileTitle" aria-hidden="true"><div class="modal-dialog modal-dialog-centered modal-sm"><div class="modal-content"><div class="modal-header"><h2 class="modal-title h5 fw-bold" id="supplierProfileTitle">Supplier profile</h2><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close profile"></button></div><div class="modal-body text-center"><img data-profile-photo src="assets/logo.png" alt="" class="supplier-profile-photo mb-3"><h3 data-profile-name class="h5 fw-bold mb-1"></h3><p data-profile-location class="small text-secondary mb-3"></p><div class="row g-2 text-start small"><div class="col-6"><div class="profile-stat"><strong data-profile-products></strong><span>Products listed</span></div></div><div class="col-6"><div class="profile-stat"><strong data-profile-joined></strong><span>Member since</span></div></div><div class="col-6"><div class="profile-stat"><strong data-profile-rating></strong><span>Average rating</span></div></div><div class="col-6"><div class="profile-stat"><strong data-profile-delivery></strong><span>Delivery score</span></div></div></div></div></div></div></div>');
  }

  function dashboardStatusClass(status) {
    return status === 'Delivered' ? 'success' : status === 'Requested' ? 'warning' : 'info';
  }

  function renderDashboard() {
    if (!document.body || document.body.dataset.page !== 'dashboard') return;
    const session = currentSession();
    const shell = document.querySelector('.dashboard-shell .container');
    if (!session || !shell || !window.FarmKonnectMarketplace) return;
    const farmer = session.role === 'farmer';
    const profile = farmer && window.FarmKonnectAuth.getCurrentUserProfile ? window.FarmKonnectAuth.getCurrentUserProfile() : null;
    const products = getDashboardProducts(session);
    const orders = getDashboardOrders(session);
    const pendingOrders = orders.filter(function (order) { return order.status !== 'Delivered'; });
    const productMarkup = products.length ? products.map(function (product, index) { return farmer ? farmerProductCard(product, index * 60) : productCard(product, index * 60); }).join('') : '<div class="col-12"><div class="empty-catalog text-center py-5"><i class="bi bi-box-seam display-5 text-ojaya"></i><h3 class="h5 fw-bold mt-3">No products yet</h3><p class="text-secondary mb-0">Add your first listing to make it visible in the marketplace.</p></div></div>';
    const orderMarkup = orders.length ? orders.map(function (order) {
      const itemNames = order.items.map(function (item) { return escapeHtml(item.name); }).join(', ');
      return '<tr><td>#' + escapeHtml(order.id) + '</td><td>' + itemNames + '</td><td>' + currency.format(order.total) + '</td><td><span class="status-pill ' + dashboardStatusClass(order.status) + '">' + escapeHtml(order.status) + '</span></td>' + (farmer ? '<td><select class="form-select form-select-sm dashboard-order-status" data-order-id="' + escapeHtml(order.id) + '"><option ' + (order.status === 'Requested' ? 'selected' : '') + '>Requested</option><option ' + (order.status === 'Preparing' ? 'selected' : '') + '>Preparing</option><option ' + (order.status === 'In Transit' ? 'selected' : '') + '>In Transit</option><option ' + (order.status === 'Delivered' ? 'selected' : '') + '>Delivered</option></select></td>' : '') + '</tr>';
    }).join('') : '<tr><td colspan="5" class="text-center text-secondary py-4">No orders recorded yet.</td></tr>';

    const verificationMarkup = farmer && profile && profile.verificationStatus !== 'submitted' ? '<div class="card border-0 shadow-sm rounded-4 p-3 p-md-4 mb-4 verification-card"><div class="d-flex justify-content-between align-items-start gap-3 mb-3"><div><p class="text-uppercase text-secondary fw-semibold small mb-1">Complete registration</p><h2 class="h5 fw-bold mb-1">Verify your account</h2><p class="small text-secondary mb-0">Add your phone and payout details so FarmKonnect can verify your account.</p></div><span class="status-pill warning">Pending</span></div><form id="farmerVerificationForm" class="row g-3"><div class="col-md-6"><label class="form-label" for="verificationPhone">Phone number</label><input id="verificationPhone" class="form-control" type="tel" maxlength="20" required></div><div class="col-md-6"><label class="form-label" for="verificationBankName">Bank name</label><input id="verificationBankName" class="form-control" maxlength="80" required></div><div class="col-md-6"><label class="form-label" for="verificationAccountName">Account name</label><input id="verificationAccountName" class="form-control" maxlength="100" required></div><div class="col-md-6"><label class="form-label" for="verificationAccountNumber">Account number</label><input id="verificationAccountNumber" class="form-control" inputmode="numeric" maxlength="10" pattern="[0-9]{10}" required></div><div class="col-12"><button type="submit" class="btn btn-gold">Submit verification details</button><span id="verificationFeedback" class="small ms-2" role="status"></span></div></form></div>' : (farmer ? '<div class="alert alert-success d-flex align-items-center gap-2 mb-4"><i class="bi bi-check-circle-fill"></i><span>Verification details submitted for review.</span></div>' : '');

    shell.innerHTML = '<div class="dashboard-hero card border-0 shadow-sm rounded-4 p-4 p-md-5 mb-4"><div class="row g-4 align-items-center"><div class="col-lg-8"><p class="text-uppercase text-secondary fw-semibold small mb-2">' + (farmer ? 'Farmer workspace' : 'Consumer workspace') + '</p><h1 class="display-6 fw-bold mb-2">Welcome back, ' + escapeHtml(session.fullName) + '</h1><p class="text-secondary mb-3">' + (farmer ? 'List your produce and manage orders connected to your own listings.' : 'Browse available produce, manage your basket, and track your orders here.') + '</p><div class="d-flex flex-wrap gap-2">' + (farmer ? '<button type="button" class="btn btn-ojaya" data-dashboard-add-product><i class="bi bi-plus-circle me-2"></i>Add Product</button>' : '<button type="button" class="btn btn-ojaya cart-badge" data-cart-open><i class="bi bi-basket2 me-2"></i>Open Basket <span data-cart-count class="cart-count-badge d-none">0</span></button>') + '</div></div><div class="col-lg-4"><div class="dashboard-search p-3 rounded-3 border bg-white"><label for="dashboardSearch" class="small text-secondary mb-2 d-block">Search this workspace</label><input id="dashboardSearch" type="search" class="form-control" placeholder="Search products or orders"></div></div></div></div>' + verificationMarkup +
      '<div class="row g-3 mb-4"><div class="col-sm-6 col-xl-3"><div class="metric-card metric-green p-3 rounded-4 h-100"><p class="small text-secondary mb-1">My products</p><h3 class="fw-bold mb-1">' + products.length + '</h3><span class="small text-secondary">Live marketplace listings</span></div></div><div class="col-sm-6 col-xl-3"><div class="metric-card metric-gold p-3 rounded-4 h-100"><p class="small text-secondary mb-1">Orders</p><h3 class="fw-bold mb-1">' + orders.length + '</h3><span class="small text-secondary">Recorded orders</span></div></div><div class="col-sm-6 col-xl-3"><div class="metric-card p-3 rounded-4 h-100"><p class="small text-secondary mb-1">Pending</p><h3 class="fw-bold mb-1">' + pendingOrders.length + '</h3><span class="small text-secondary">Needs attention</span></div></div><div class="col-sm-6 col-xl-3"><div class="metric-card p-3 rounded-4 h-100"><p class="small text-secondary mb-1">Session</p><h3 class="fw-bold mb-1">Active</h3><span class="small text-success">Authenticated</span></div></div></div>' +
      (farmer ? '<div id="dashboardProductForm" class="card border-0 shadow-sm rounded-4 p-3 p-md-4 mb-4 d-none"><div class="d-flex justify-content-between align-items-center mb-3"><h2 class="h5 fw-bold mb-0">Add a product</h2><button type="button" class="btn-close" data-dashboard-close-form aria-label="Close form"></button></div><form id="farmerProductForm" class="row g-3"><div class="col-md-6"><label class="form-label" for="productName">Product name</label><input id="productName" class="form-control" required maxlength="80"></div><div class="col-md-3"><label class="form-label" for="productOriginalPrice">Your original price</label><input id="productOriginalPrice" class="form-control" type="number" min="1" step="1" required></div><div class="col-md-3"><label class="form-label" for="productPrice">Suggested price</label><input id="productPrice" class="form-control" type="number" min="1" step="1" required></div><div class="col-md-4"><label class="form-label" for="productUnit">Unit</label><input id="productUnit" class="form-control" placeholder="kg, crate, bundle" required maxlength="30"></div><div class="col-md-4"><label class="form-label" for="productCategory">Category</label><input id="productCategory" class="form-control" placeholder="Vegetables" required maxlength="40"></div><div class="col-md-4"><label class="form-label" for="productStock">Starting stock</label><input id="productStock" class="form-control" type="number" min="0" step="1" required></div><div class="col-md-6"><label class="form-label" for="productImage">Product image (required)</label><input id="productImage" class="form-control" type="file" accept="image/png,image/jpeg,image/webp,image/gif" required></div><div class="col-12"><label class="form-label" for="productDescription">Description</label><textarea id="productDescription" class="form-control" rows="2" required maxlength="180"></textarea></div><div class="col-12"><button class="btn btn-ojaya" type="submit">Submit for approval</button><div id="farmerProductFeedback" class="small mt-2" role="status"></div></div></form></div>' : '') +
      '<div class="card border-0 shadow-sm rounded-4 p-3 p-md-4 mb-4"><div class="d-flex justify-content-between align-items-center mb-3"><h2 class="h5 fw-bold mb-0">' + (farmer ? 'My listings' : 'Available products') + '</h2><span class="small text-secondary">' + products.length + ' item(s)</span></div><div id="dashboardProductGrid" data-product-limit="' + (farmer ? '4' : '6') + '" class="row g-4">' + productMarkup + '</div></div>' +
      '<div class="card border-0 shadow-sm rounded-4 p-3 p-md-4 mb-4"><div class="d-flex justify-content-between align-items-center mb-3"><h2 class="h5 fw-bold mb-0">' + (farmer ? 'Orders for my products' : 'My orders') + '</h2><span class="small text-secondary">' + orders.length + ' order(s)</span></div><div class="table-responsive"><table class="table align-middle dashboard-table"><thead><tr><th>Order</th><th>Products</th><th>Total</th><th>Status</th>' + (farmer ? '<th>Update</th>' : '') + '</tr></thead><tbody>' + orderMarkup + '</tbody></table></div></div>' +
      '<div class="card border-0 shadow-sm rounded-4 p-3 p-md-4"><h2 class="h6 fw-bold mb-3">Account</h2><p class="small text-secondary mb-1">Portal</p><p class="fw-semibold mb-2">' + escapeHtml(session.role) + '</p><p class="small text-secondary mb-1">Email</p><p class="fw-semibold mb-3">' + escapeHtml(session.email) + '</p><button type="button" class="btn btn-gold" data-action="logout">Sign out</button></div>';

    bindSeeMore(document.getElementById('dashboardProductGrid'));
    shell.querySelectorAll('[data-action="logout"]').forEach(function (button) { button.addEventListener('click', function () { window.FarmKonnectAuth.signOut(); window.location.href = 'login.html'; }); });
    shell.querySelectorAll('[data-dashboard-add-product]').forEach(function (button) { button.addEventListener('click', function () { document.getElementById('dashboardProductForm').classList.remove('d-none'); document.getElementById('productName').focus(); }); });
    shell.querySelectorAll('[data-dashboard-close-form]').forEach(function (button) { button.addEventListener('click', function () { document.getElementById('dashboardProductForm').classList.add('d-none'); }); });
    const verificationForm = document.getElementById('farmerVerificationForm');
    if (verificationForm) verificationForm.addEventListener('submit', function (event) { event.preventDefault(); const feedback = document.getElementById('verificationFeedback'); try { window.FarmKonnectAuth.completeFarmerVerification(session, { phone: document.getElementById('verificationPhone').value, bankName: document.getElementById('verificationBankName').value, accountName: document.getElementById('verificationAccountName').value, accountNumber: document.getElementById('verificationAccountNumber').value }); renderDashboard(); } catch (error) { feedback.textContent = error.message; feedback.className = 'small ms-2 text-danger'; } });
    const form = document.getElementById('farmerProductForm');
    if (form) form.addEventListener('submit', async function (event) { event.preventDefault(); const feedback = document.getElementById('farmerProductFeedback'); const submitButton = form.querySelector('button[type="submit"]'); try { submitButton.disabled = true; feedback.textContent = 'Reading image...'; feedback.className = 'small mt-2 text-secondary'; const image = await readProductImage(document.getElementById('productImage').files[0]); addFarmerProduct(session, { name: document.getElementById('productName').value, originalPrice: document.getElementById('productOriginalPrice').value, price: document.getElementById('productPrice').value, stock: document.getElementById('productStock').value, unit: document.getElementById('productUnit').value, category: document.getElementById('productCategory').value, image: image, description: document.getElementById('productDescription').value }); form.reset(); renderDashboard(); } catch (error) { feedback.textContent = error.message; feedback.className = 'small mt-2 text-danger'; } finally { submitButton.disabled = false; } });
    shell.querySelectorAll('[data-save-stock]').forEach(function (button) { button.addEventListener('click', function () { const input = shell.querySelector('[data-stock-product="' + button.dataset.saveStock + '"]'); if (updateFarmerStock(button.dataset.saveStock, input.value, session)) renderDashboard(); }); });
    shell.querySelectorAll('[data-delete-product]').forEach(function (button) { button.addEventListener('click', function () { if (window.confirm('Delete this product listing? Existing orders will be kept.')) { deleteFarmerProduct(button.dataset.deleteProduct, session); renderDashboard(); } }); });
    shell.querySelectorAll('.dashboard-order-status').forEach(function (select) { select.addEventListener('change', function () { updateOrderStatus(select.dataset.orderId, select.value, session); renderDashboard(); }); });
    const dashboardSearch = document.getElementById('dashboardSearch');
    if (dashboardSearch) dashboardSearch.addEventListener('input', function () {
      const query = dashboardSearch.value.toLowerCase().trim();
      const productGrid = document.getElementById('dashboardProductGrid');
      const productLimit = Number(productGrid.dataset.productLimit);
      productGrid.querySelectorAll('[data-dashboard-product]').forEach(function (card) {
        const matches = card.textContent.toLowerCase().includes(query);
        const isBeyondLimit = !query && Number(card.dataset.productOrder) >= productLimit;
        card.classList.toggle('d-none', !matches || isBeyondLimit);
      });
      productGrid.querySelectorAll('[data-see-more]').forEach(function (button) { button.classList.toggle('d-none', Boolean(query)); });
      shell.querySelectorAll('.dashboard-table tbody tr').forEach(function (row) { row.classList.toggle('d-none', Boolean(query) && !row.textContent.toLowerCase().includes(query)); });
    });
  }

  function injectCartModal() {
    if (document.getElementById('cartModal')) return;
    document.body.insertAdjacentHTML('beforeend', '<div class="modal fade" id="cartModal" tabindex="-1" aria-labelledby="cartTitle" aria-hidden="true"><div class="modal-dialog modal-dialog-centered"><div class="modal-content cart-modal"><div class="modal-header"><div><p class="overline text-uppercase fw-semibold text-ojaya mb-1">Your basket</p><h2 class="modal-title h4 fw-bold" id="cartTitle">Ready when you are</h2></div><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close basket"></button></div><div class="modal-body"><div id="cartItems"></div><div id="cartEmpty" class="empty-cart text-center py-4"><i class="bi bi-basket2 display-6 text-ojaya"></i><p class="fw-semibold mt-3 mb-1">Your basket is empty</p><p class="text-secondary small mb-0">Add a few fresh picks to get started.</p></div><div id="cartSummary" class="cart-summary d-none mt-3"><div class="d-flex justify-content-between small"><span>Subtotal</span><strong id="cartSubtotal"></strong></div><div class="d-flex justify-content-between small mt-2"><span>Local delivery</span><strong>₦1,500</strong></div><hr><div class="d-flex justify-content-between"><span class="fw-bold">Total</span><strong class="text-ojaya" id="cartTotal"></strong></div></div><form id="checkoutForm" class="mt-4"><label class="form-label small fw-semibold" for="deliveryAddress">Delivery address</label><textarea id="deliveryAddress" class="form-control" rows="2" placeholder="Street, area, city" required></textarea></form><div id="orderConfirmation" class="d-none text-center py-4"><i class="bi bi-check-circle-fill confirmation-icon"></i><h3 class="h5 fw-bold mt-3">Order received</h3><p class="small text-secondary">We are preparing your produce. Your order number is <strong id="orderNumber"></strong>.</p></div></div><div class="modal-footer"><button type="button" class="btn btn-outline-ojaya" data-bs-dismiss="modal">Continue shopping</button><button type="button" class="btn btn-ojaya" id="checkoutButton"><i class="bi bi-lock me-2"></i>Place order</button></div></div></div></div>');
    document.getElementById('checkoutForm').insertAdjacentHTML('afterbegin', '<div class="payment-instructions mb-3"><p class="small fw-bold mb-2">Pay the Admin delivery account</p><div class="small"><div><span class="text-secondary">Bank:</span> <strong>' + escapeHtml(ADMIN_PAYMENT_DETAILS.bankName) + '</strong></div><div><span class="text-secondary">Account name:</span> <strong>' + escapeHtml(ADMIN_PAYMENT_DETAILS.accountName) + '</strong></div><div><span class="text-secondary">Account number:</span> <strong>' + escapeHtml(ADMIN_PAYMENT_DETAILS.accountNumber) + '</strong></div></div><p class="small text-secondary mb-0 mt-2">After transfer, enter your payment reference below. Admin will confirm payment before dispatch.</p></div><label class="form-label small fw-semibold" for="paymentReference">Payment reference</label><input id="paymentReference" class="form-control mb-3" maxlength="100" placeholder="Transfer reference" required>');
  }

  function init() {
    getCatalog();
    renderProducts();
    injectCartModal();
    injectSupplierProfileModal();
    renderDashboard();
    document.querySelectorAll('[data-cart-open]').forEach(function (button) { button.addEventListener('click', openCart); });
    document.addEventListener('click', function (event) {
      const productButton = event.target.closest('[data-product-id]');
      const profileButton = event.target.closest('[data-farmer-profile]');
      const increase = event.target.closest('[data-cart-increase]');
      const decrease = event.target.closest('[data-cart-decrease]');
      const remove = event.target.closest('[data-cart-remove]');
      if (productButton) addToCart(productFromButton(productButton));
      if (profileButton) showSupplierProfile(profileButton.dataset.farmerProfile);
      if (increase) changeQuantity(increase.dataset.cartIncrease, 1);
      if (decrease) changeQuantity(decrease.dataset.cartDecrease, -1);
      if (remove) { changeQuantity(remove.dataset.cartRemove, -999); }
    });
    document.getElementById('checkoutButton').addEventListener('click', checkout);
    document.getElementById('cartModal').addEventListener('hidden.bs.modal', function () {
      document.getElementById('checkoutForm').classList.remove('d-none');
      document.getElementById('orderConfirmation').classList.add('d-none');
    });
    updateCount();

    const pendingAction = read(PENDING_ACTION_KEY, null);
    if (pendingAction && isConsumer()) {
      localStorage.removeItem(PENDING_ACTION_KEY);
      window.setTimeout(function () {
        if (pendingAction.type === 'add-to-cart') {
          const productButton = document.querySelector('[data-product-id="' + pendingAction.productId + '"]');
          if (productButton) addToCart(productFromButton(productButton));
        }
        if (pendingAction.type === 'open-cart') openCart();
      }, 100);
    }

    const search = document.getElementById('produceSearch');
    const filter = document.getElementById('produceFilter');
    if (search) {
      const applyFilters = function () {
        const query = search.value.toLowerCase().trim();
        const category = filter.value;
        document.querySelectorAll('[data-produce-card]').forEach(function (card) {
          const matchQuery = card.textContent.toLowerCase().includes(query);
          const matchCategory = category === 'all' || card.dataset.category === category;
          const collapsed = !query && card.classList.contains('product-card-extra');
          card.classList.toggle('d-none', !(matchQuery && matchCategory) || collapsed);
        });
      };
      search.addEventListener('input', applyFilters);
      filter.addEventListener('change', applyFilters);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  window.FarmKonnectMarketplace = {
    getPaymentDetails: function () { return Object.assign({}, ADMIN_PAYMENT_DETAILS); },
    getOrdersForAdmin: function () { return read(ORDERS_KEY, []); },
    getPendingProducts: getPendingProducts,
    getInventory: function () { return getCatalog().products.slice(); },
    getCatalog: getCatalog,
    getProductsForDashboard: getDashboardProducts,
    getOrdersForDashboard: getDashboardOrders,
    addFarmerProduct: addFarmerProduct,
    updateFarmerStock: updateFarmerStock,
    deleteFarmerProduct: deleteFarmerProduct,
    confirmPayment: confirmPayment,
    approveProduct: approveProduct,
    rejectProduct: rejectProduct,
    updateOrderStatus: updateOrderStatus
  };
})();
