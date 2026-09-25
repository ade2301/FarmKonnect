     (function () {
  'use strict';

  const ADMIN_KEY = 'Ad3mola@2301@Ad32026_';
  const ADMIN_SESSION_KEY = 'farmkonnect_admin_session_v1';
  const adminSession = { role: 'admin', userId: 'admin-control', fullName: 'Admin' };

  function escapeHtml(value) {
    return String(value || '').replace(/[&<>'"]/g, function (character) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character];
    });
  }

  function currency(value) {
    return new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(value);
  }

  function showApp() {
    document.getElementById('adminGate').classList.add('d-none');
    document.getElementById('adminApp').classList.remove('d-none');
    renderOrders();
    renderProducts();
    renderInventory();
    renderPayouts();
    const details = window.FarmKonnectMarketplace.getPaymentDetails();
    document.querySelector('[data-admin-bank]').textContent = details.bankName;
    document.querySelector('[data-admin-account-name]').textContent = details.accountName;
    document.querySelector('[data-admin-account-number]').textContent = details.accountNumber;
  }

  function maskAccountNumber(value) {
    const account = String(value || '');
    return account.length > 4 ? '••••••' + account.slice(-4) : '••••';
  }

  function renderPayouts() {
    const list = document.getElementById('farmerPayouts');
    const profiles = window.FarmKonnectAuth.getFarmerPayoutProfiles();
    if (!profiles.length) {
      list.innerHTML = '<tr><td colspan="6" class="text-center text-secondary py-4">No farmer payout details submitted yet.</td></tr>';
      return;
    }
    list.innerHTML = profiles.map(function (profile) {
      const statusClass = profile.verificationStatus === 'submitted' ? 'warning' : 'success';
      return '<tr><td><strong>' + escapeHtml(profile.fullName) + '</strong><small class="d-block text-secondary">' + escapeHtml(profile.email) + '</small></td><td>' + escapeHtml(profile.phone) + '</td><td>' + escapeHtml(profile.payout.bankName) + '</td><td>' + escapeHtml(profile.payout.accountName) + '</td><td><span data-account-value="' + escapeHtml(profile.payout.accountNumber) + '">' + maskAccountNumber(profile.payout.accountNumber) + '</span> <button type="button" class="btn btn-link btn-sm p-0" data-reveal-account title="Reveal account number"><i class="bi bi-eye"></i></button></td><td><span class="status-pill ' + statusClass + '">' + escapeHtml(profile.verificationStatus) + '</span></td></tr>';
    }).join('');
  }

  function renderProducts() {
    const products = window.FarmKonnectMarketplace.getPendingProducts();
    const list = document.getElementById('adminProducts');
    if (!products.length) {
      list.innerHTML = '<div class="empty-catalog text-center py-4"><i class="bi bi-check-circle display-6 text-ojaya"></i><p class="text-secondary mt-3 mb-0">No products are waiting for approval.</p></div>';
      return;
    }
    list.innerHTML = products.map(function (product) {
      return '<article class="admin-order-row"><div class="d-flex align-items-center gap-3"><img src="' + escapeHtml(product.image) + '" alt="" class="admin-product-thumb"><div><p class="small text-secondary mb-1">' + escapeHtml(product.category) + ' · ' + escapeHtml(product.unit) + '</p><h2 class="h6 fw-bold mb-1">' + escapeHtml(product.name) + '</h2><p class="small mb-1">Farmer original price: <strong>' + currency(product.originalPrice || product.price) + '</strong></p><p class="small text-secondary mb-0">Stock submitted: ' + product.stock + '</p></div></div><div class="d-flex align-items-center gap-2"><label class="visually-hidden" for="admin-price-' + escapeHtml(product.id) + '">Approved selling price</label><input id="admin-price-' + escapeHtml(product.id) + '" class="form-control form-control-sm admin-price-input" type="number" min="1" value="' + product.price + '"><button type="button" class="btn btn-gold btn-sm" data-approve-product="' + escapeHtml(product.id) + '">Approve</button><button type="button" class="btn btn-outline-danger btn-sm" data-reject-product="' + escapeHtml(product.id) + '">Reject</button></div></article>';
    }).join('');
  }

  function renderInventory() {
    const catalog = window.FarmKonnectMarketplace.getCatalog();
    const owners = {};
    catalog.suppliers.forEach(function (supplier) { owners[supplier.id] = supplier.name; });
    const list = document.getElementById('adminInventory');
    list.innerHTML = catalog.products.map(function (product) {
      const status = product.approvalStatus || 'approved';
      return '<tr><td>' + escapeHtml(product.name) + '</td><td>' + escapeHtml(owners[product.supplierId] || product.supplierId) + '</td><td>' + currency(product.originalPrice || product.price) + '</td><td>' + currency(product.price) + '</td><td>' + product.stock + '</td><td><span class="status-pill ' + (status === 'approved' ? 'success' : status === 'pending' ? 'warning' : 'danger') + '">' + escapeHtml(status) + '</span></td></tr>';
    }).join('') || '<tr><td colspan="6" class="text-center text-secondary">No inventory records.</td></tr>';
  }

  function renderOrders() {
    const orders = window.FarmKonnectMarketplace.getOrdersForAdmin();
    const pending = orders.filter(function (order) { return order.paymentStatus === 'submitted'; });
    const list = document.getElementById('adminOrders');
    document.getElementById('pendingPaymentCount').textContent = pending.length;
    if (!pending.length) {
      list.innerHTML = '<div class="empty-catalog text-center py-5"><i class="bi bi-check-circle display-5 text-ojaya"></i><h2 class="h5 fw-bold mt-3">No payments awaiting confirmation</h2><p class="text-secondary mb-0">New transfer references will appear here.</p></div>';
      return;
    }
    list.innerHTML = pending.map(function (order) {
      const products = order.items.map(function (item) { return escapeHtml(item.name) + ' × ' + item.quantity; }).join(', ');
      return '<article class="admin-order-row"><div><p class="small text-secondary mb-1">Order #' + escapeHtml(order.id) + '</p><h2 class="h6 fw-bold mb-1">' + products + '</h2><p class="small mb-1">Total: <strong>' + currency(order.total) + '</strong></p><p class="small text-secondary mb-0">Transfer reference: <strong>' + escapeHtml(order.paymentReference) + '</strong></p></div><button type="button" class="btn btn-gold" data-confirm-payment="' + escapeHtml(order.id) + '">Confirm payment</button></article>';
    }).join('');
  }

  function init() {
    const gate = document.getElementById('adminGate');
    const app = document.getElementById('adminApp');
    if (sessionStorage.getItem(ADMIN_SESSION_KEY) === 'active') showApp();
    document.getElementById('adminKeyForm').addEventListener('submit', function (event) {
      event.preventDefault();
      const feedback = document.getElementById('adminKeyFeedback');
      if (document.getElementById('adminKey').value.trim() !== ADMIN_KEY) {
        feedback.textContent = 'Invalid Admin key.';
        feedback.className = 'small text-danger mt-2';
        return;
      }
      sessionStorage.setItem(ADMIN_SESSION_KEY, 'active');
      feedback.textContent = '';
      showApp();
    });
    document.querySelector('[data-admin-logout]').addEventListener('click', function () {
      sessionStorage.removeItem(ADMIN_SESSION_KEY);
      app.classList.add('d-none');
      gate.classList.remove('d-none');
    });
    document.addEventListener('click', function (event) {
      const button = event.target.closest('[data-confirm-payment]');
      const approve = event.target.closest('[data-approve-product]');
      const reject = event.target.closest('[data-reject-product]');
      const reveal = event.target.closest('[data-reveal-account]');
      if (button && window.FarmKonnectMarketplace.confirmPayment(button.dataset.confirmPayment, adminSession)) {
        renderOrders();
      }
      if (approve) { const price = document.getElementById('admin-price-' + approve.dataset.approveProduct).value; if (window.FarmKonnectMarketplace.approveProduct(approve.dataset.approveProduct, price, adminSession)) { renderProducts(); renderInventory(); } }
      if (reject && window.FarmKonnectMarketplace.rejectProduct(reject.dataset.rejectProduct, adminSession)) { renderProducts(); renderInventory(); }
      if (reveal) {
        const value = reveal.parentElement.querySelector('[data-account-value]');
        value.textContent = value.textContent.indexOf('•') === 0 ? value.dataset.accountValue : maskAccountNumber(value.dataset.accountValue);
        reveal.innerHTML = value.textContent.indexOf('•') === 0 ? '<i class="bi bi-eye-slash"></i>' : '<i class="bi bi-eye"></i>';
      }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
