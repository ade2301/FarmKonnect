(function () {
  'use strict';

  const CART_KEY = 'farmkonnect_cart_v1';
  const ORDERS_KEY = 'farmkonnect_orders_v1';
  const currency = new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 });

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

  function cart() {
    return read(CART_KEY, []);
  }

  function total(items) {
    return items.reduce(function (sum, item) { return sum + item.price * item.quantity; }, 0);
  }

  function productFromButton(button) {
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
    renderCart();
    const modal = document.getElementById('cartModal');
    if (window.bootstrap && modal) window.bootstrap.Modal.getOrCreateInstance(modal).show();
  }

  function addToCart(product) {
    const items = cart();
    const existing = items.find(function (item) { return item.id === product.id; });
    if (existing) existing.quantity += 1;
    else items.push(Object.assign(product, { quantity: 1 }));
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
    const order = { id: 'FK-' + Date.now().toString().slice(-6), items: items, total: total(items) + 1500, createdAt: new Date().toISOString(), status: 'Preparing' };
    const orders = read(ORDERS_KEY, []);
    orders.unshift(order);
    save(ORDERS_KEY, orders.slice(0, 20));
    save(CART_KEY, []);
    renderCart();
    document.getElementById('checkoutForm').classList.add('d-none');
    document.getElementById('orderConfirmation').classList.remove('d-none');
    document.getElementById('orderNumber').textContent = '#' + order.id;
  }

  function injectCartModal() {
    if (document.getElementById('cartModal')) return;
    document.body.insertAdjacentHTML('beforeend', '<div class="modal fade" id="cartModal" tabindex="-1" aria-labelledby="cartTitle" aria-hidden="true"><div class="modal-dialog modal-dialog-centered"><div class="modal-content cart-modal"><div class="modal-header"><div><p class="overline text-uppercase fw-semibold text-ojaya mb-1">Your basket</p><h2 class="modal-title h4 fw-bold" id="cartTitle">Ready when you are</h2></div><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close basket"></button></div><div class="modal-body"><div id="cartItems"></div><div id="cartEmpty" class="empty-cart text-center py-4"><i class="bi bi-basket2 display-6 text-ojaya"></i><p class="fw-semibold mt-3 mb-1">Your basket is empty</p><p class="text-secondary small mb-0">Add a few fresh picks to get started.</p></div><div id="cartSummary" class="cart-summary d-none mt-3"><div class="d-flex justify-content-between small"><span>Subtotal</span><strong id="cartSubtotal"></strong></div><div class="d-flex justify-content-between small mt-2"><span>Local delivery</span><strong>₦1,500</strong></div><hr><div class="d-flex justify-content-between"><span class="fw-bold">Total</span><strong class="text-ojaya" id="cartTotal"></strong></div></div><form id="checkoutForm" class="mt-4"><label class="form-label small fw-semibold" for="deliveryAddress">Delivery address</label><textarea id="deliveryAddress" class="form-control" rows="2" placeholder="Street, area, city" required></textarea></form><div id="orderConfirmation" class="d-none text-center py-4"><i class="bi bi-check-circle-fill confirmation-icon"></i><h3 class="h5 fw-bold mt-3">Order received</h3><p class="small text-secondary">We are preparing your produce. Your order number is <strong id="orderNumber"></strong>.</p></div></div><div class="modal-footer"><button type="button" class="btn btn-outline-ojaya" data-bs-dismiss="modal">Continue shopping</button><button type="button" class="btn btn-ojaya" id="checkoutButton"><i class="bi bi-lock me-2"></i>Place order</button></div></div></div></div>');
  }

  function init() {
    injectCartModal();
    document.querySelectorAll('[data-cart-open]').forEach(function (button) { button.addEventListener('click', openCart); });
    document.querySelectorAll('[data-product]').forEach(function (button) { button.addEventListener('click', function () { addToCart(productFromButton(button)); }); });
    document.addEventListener('click', function (event) {
      const increase = event.target.closest('[data-cart-increase]');
      const decrease = event.target.closest('[data-cart-decrease]');
      const remove = event.target.closest('[data-cart-remove]');
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

    const search = document.getElementById('produceSearch');
    const filter = document.getElementById('produceFilter');
    if (search) {
      const applyFilters = function () {
        const query = search.value.toLowerCase().trim();
        const category = filter.value;
        document.querySelectorAll('[data-produce-card]').forEach(function (card) {
          const matchQuery = card.textContent.toLowerCase().includes(query);
          const matchCategory = category === 'all' || card.dataset.category === category;
          card.classList.toggle('d-none', !(matchQuery && matchCategory));
        });
      };
      search.addEventListener('input', applyFilters);
      filter.addEventListener('change', applyFilters);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
