(() => {
  // ---------- State ----------
  const CART_KEY = "ember-cart";
  const ORDERS_KEY = "ember-orders";
  let activeCategory = "All";
  let searchTerm = "";
  let cart = loadJSON(CART_KEY, []); // [{ id, qty }]

  // ---------- DOM ----------
  const $ = (sel) => document.querySelector(sel);
  const el = {
    tabs: $("#categoryTabs"),
    list: $("#menuList"),
    empty: $("#emptyMsg"),
    search: $("#searchInput"),
    cartPanel: $("#cartPanel"),
    overlay: $("#overlay"),
    cartItems: $("#cartItems"),
    cartEmpty: $("#cartEmpty"),
    cartCount: $("#cartCount"),
    subtotal: $("#subtotal"),
    delivery: $("#delivery"),
    tax: $("#tax"),
    grand: $("#grandTotal"),
    checkoutBtn: $("#checkoutBtn"),
    checkoutModal: $("#checkoutModal"),
    checkoutForm: $("#checkoutForm"),
    confirmModal: $("#confirmModal"),
    orderId: $("#orderId"),
    eta: $("#eta"),
  };

  // ---------- Helpers ----------
  function loadJSON(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
    catch { return fallback; }
  }
  function saveJSON(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
  const money = (n) => `$${n.toFixed(2)}`;
  const itemById = (id) => MENU.find((m) => m.id === id);

  // ---------- Menu rendering ----------
  function renderTabs() {
    const categories = ["All", ...new Set(MENU.map((m) => m.category))];
    el.tabs.innerHTML = "";
    categories.forEach((cat) => {
      const b = document.createElement("button");
      b.className = "tab";
      b.textContent = cat;
      b.setAttribute("role", "tab");
      b.setAttribute("aria-selected", String(cat === activeCategory));
      b.addEventListener("click", () => {
        activeCategory = cat;
        renderTabs();
        renderMenu();
      });
      el.tabs.appendChild(b);
    });
  }

  function renderMenu() {
    const term = searchTerm.trim().toLowerCase();
    const items = MENU.filter((m) =>
      (activeCategory === "All" || m.category === activeCategory) &&
      (!term || m.name.toLowerCase().includes(term) || m.desc.toLowerCase().includes(term))
    );

    el.list.innerHTML = "";
    items.forEach((m) => {
      const li = document.createElement("li");
      li.className = "menu-item";
      li.innerHTML = `
        <span class="item-name"></span>
        <span class="item-price">${money(m.price)}</span>
        <p class="item-desc"></p>
        <div class="item-meta">
          ${m.tags.map((t) => `<span class="tag">${t}</span>`).join("")}
          <button class="add-btn" type="button">Add</button>
        </div>`;
      li.querySelector(".item-name").textContent = m.name;
      li.querySelector(".item-desc").textContent = m.desc;
      const btn = li.querySelector(".add-btn");
      btn.addEventListener("click", () => {
        addToCart(m.id);
        btn.textContent = "Added ✓";
        btn.classList.add("added");
        setTimeout(() => {
          btn.textContent = "Add";
          btn.classList.remove("added");
        }, 900);
      });
      el.list.appendChild(li);
    });
    el.empty.hidden = items.length > 0;
  }

  // ---------- Cart logic ----------
  function addToCart(id) {
    const line = cart.find((l) => l.id === id);
    if (line) line.qty += 1;
    else cart.push({ id, qty: 1 });
    persistAndRender();
  }

  function changeQty(id, delta) {
    const line = cart.find((l) => l.id === id);
    if (!line) return;
    line.qty += delta;
    if (line.qty <= 0) cart = cart.filter((l) => l.id !== id);
    persistAndRender();
  }

  function removeLine(id) {
    cart = cart.filter((l) => l.id !== id);
    persistAndRender();
  }

  function cartTotals() {
    const subtotal = cart.reduce((sum, l) => sum + itemById(l.id).price * l.qty, 0);
    const delivery = cart.length ? DELIVERY_FEE : 0;
    const tax = subtotal * TAX_RATE;
    return { subtotal, delivery, tax, total: subtotal + delivery + tax };
  }

  function renderCart() {
    el.cartItems.innerHTML = "";
    cart.forEach((l) => {
      const m = itemById(l.id);
      const li = document.createElement("li");
      li.className = "cart-item";
      li.innerHTML = `
        <div>
          <div class="name"></div>
          <div class="qty">
            <button type="button" data-act="dec" aria-label="Decrease">−</button>
            <span>${l.qty}</span>
            <button type="button" data-act="inc" aria-label="Increase">+</button>
          </div>
        </div>
        <div class="line-total">${money(m.price * l.qty)}
          <br><button class="remove" type="button">Remove</button>
        </div>`;
      li.querySelector(".name").textContent = m.name;
      li.querySelector('[data-act="dec"]').addEventListener("click", () => changeQty(l.id, -1));
      li.querySelector('[data-act="inc"]').addEventListener("click", () => changeQty(l.id, 1));
      li.querySelector(".remove").addEventListener("click", () => removeLine(l.id));
      el.cartItems.appendChild(li);
    });

    const count = cart.reduce((s, l) => s + l.qty, 0);
    const t = cartTotals();
    el.cartCount.textContent = count;
    el.cartEmpty.hidden = cart.length > 0;
    el.subtotal.textContent = money(t.subtotal);
    el.delivery.textContent = money(t.delivery);
    el.tax.textContent = money(t.tax);
    el.grand.textContent = money(t.total);
    el.checkoutBtn.disabled = cart.length === 0;
  }

  function persistAndRender() {
    saveJSON(CART_KEY, cart);
    renderCart();
  }

  // ---------- Cart panel ----------
  function openCart() {
    el.cartPanel.classList.add("open");
    el.overlay.classList.add("show");
  }
  function closeCart() {
    el.cartPanel.classList.remove("open");
    el.overlay.classList.remove("show");
  }

  // ---------- Checkout ----------
  const validators = {
    name: (v) => (v.trim().length >= 2 ? "" : "Please enter your name."),
    phone: (v) => (/^[+\d\s()-]{7,}$/.test(v) ? "" : "Enter a valid phone number."),
    address: (v) => (v.trim().length >= 5 ? "" : "Enter a full delivery address."),
  };

  function validateForm() {
    let ok = true;
    const data = new FormData(el.checkoutForm);
    Object.keys(validators).forEach((field) => {
      const input = el.checkoutForm.elements[field];
      const msg = validators[field](data.get(field) || "");
      input.classList.toggle("invalid", Boolean(msg));
      el.checkoutForm.querySelector(`[data-for="${field}"]`).textContent = msg;
      if (msg) ok = false;
    });
    return ok;
  }

  el.checkoutForm.addEventListener("input", (e) => {
    const field = e.target.name;
    if (validators[field]) {
      const msg = validators[field](e.target.value);
      e.target.classList.toggle("invalid", Boolean(msg));
      el.checkoutForm.querySelector(`[data-for="${field}"]`).textContent = msg;
    }
  });

  function placeOrder(e) {
    e.preventDefault();
    if (!validateForm()) return;

    const data = Object.fromEntries(new FormData(el.checkoutForm));
    const totals = cartTotals();
    const order = {
      id: "EK-" + Math.random().toString(36).slice(2, 7).toUpperCase(),
      createdAt: new Date().toISOString(),
      customer: data,
      items: cart.map((l) => ({ name: itemById(l.id).name, qty: l.qty, price: itemById(l.id).price })),
      totals,
    };

    const orders = loadJSON(ORDERS_KEY, []);
    orders.push(order);
    saveJSON(ORDERS_KEY, orders);

    cart = [];
    persistAndRender();
    el.checkoutForm.reset();
    el.checkoutModal.hidden = true;
    closeCart();

    const eta = new Date(Date.now() + 30 * 60 * 1000);
    el.orderId.textContent = order.id;
    el.eta.textContent = eta.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    el.confirmModal.hidden = false;
  }

  // ---------- Events ----------
  $("#cartToggle").addEventListener("click", openCart);
  $("#closeCart").addEventListener("click", closeCart);
  el.overlay.addEventListener("click", closeCart);
  el.checkoutBtn.addEventListener("click", () => {
    closeCart();
    el.checkoutModal.hidden = false;
    el.checkoutForm.elements.name.focus();
  });
  $("#cancelCheckout").addEventListener("click", () => { el.checkoutModal.hidden = true; openCart(); });
  el.checkoutForm.addEventListener("submit", placeOrder);
  $("#doneBtn").addEventListener("click", () => { el.confirmModal.hidden = true; });
  el.search.addEventListener("input", (e) => { searchTerm = e.target.value; renderMenu(); });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeCart();
      el.checkoutModal.hidden = true;
    }
  });

  // ---------- Init ----------
  renderTabs();
  renderMenu();
  renderCart();
})();
