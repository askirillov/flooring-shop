// Flooring Shop PWA v5 - Google Sheets CSV
const SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTUzA3wfAi14jLyPbnDImO0c-hANSdm0CUy5qR9L3FZ9SMtsYXaH1pzXUdJ1wI2oUqcVbD9QtXXIyL7/pub?gid=0&single=true&output=csv';

let allProducts = [];
let filteredProducts = [];
let cart = JSON.parse(localStorage.getItem('flooringCart') || '[]');
let pdfDataUrl = null;

// Parse CSV text to array of objects
function parseCSV(csvText) {
    const lines = csvText.trim().split('\n');
    if (lines.length < 2) return [];
    
    const headers = lines[0].split('|').map(h => h.trim());
    const products = [];
    
    for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split('|').map(v => v.trim());
        if (!values[0]) continue; // skip empty rows
        
        const product = {};
        headers.forEach((header, index) => {
            product[header] = values[index] || '';
        });
        
        // Map to expected field names
        product.sku = product['Артикул'] || i;
        product.design = product['Дизайн'] || '';
        product.collection = product['Коллекция'] || '';
        product.type = product['Вид'] || '';
        product.width = parseFloat(product['Ширина']) || 0;
        product.price = parseFloat(product['Цена']) || 0;
        product.stock = parseFloat(product['Остаток м²']) || 0;
        product.thickness = parseFloat(product['Толщина']) || 2.5;
        product.wearLayer = parseFloat(product['Защита']) || 0.2;
        product.promotion = (product['Акция'] || '').toLowerCase().trim();
        product.image = product['Фото'] || '';
        
        // Calculate roll area and price
        product.roll_area = product.width * 20; // ~20m standard roll length
        product.rollPrice = Math.round(product.price * product.roll_area);
        
        products.push(product);
    }
    
    return products;
}

async function loadProducts() {
    try {
        // 1. Показываем кэш мгновенно (если есть)
        const cached = localStorage.getItem('flooringCache');
        if (cached) {
            allProducts = JSON.parse(cached);
            populateFilters();
            applyFilters();
            updateCartBar();
            document.getElementById('updateDate').textContent = 'Обновление...';
        }
        
        // 2. Фоном тянем свежие данные из Google Sheets
        const response = await fetch(SHEET_CSV_URL + '&_=' + Date.now());
        const csvText = await response.text();
        
        if (csvText && csvText.includes('Артикул')) {
            const freshProducts = parseCSV(csvText);
            if (freshProducts.length >= 3) {
                allProducts = freshProducts;
                localStorage.setItem('flooringCache', JSON.stringify(allProducts));
                localStorage.setItem('flooringCacheTime', Date.now().toString());
            } else {
                console.log('CSV has < 3 products, using demo data');
                throw new Error('Insufficient data');
            }
        } else {
            throw new Error('No CSV');
        }
        
        populateFilters();
        applyFilters();
        updateCartBar();
        
        const cacheTime = localStorage.getItem('flooringCacheTime');
        const dateStr = cacheTime ? new Date(parseInt(cacheTime)).toLocaleDateString('ru-RU') : new Date().toLocaleDateString('ru-RU');
        document.getElementById('updateDate').textContent = dateStr;
        
    } catch (error) {
        console.error('Error:', error);
        // Fallback: показываем тестовые данные если всё сломалось
        const response = await fetch('products.json?v=2');
        allProducts = await response.json();
        allProducts.forEach(p => {
            p.thickness = p.thickness || 2.5;
            p.wearLayer = p.wearLayer || 0.2;
            p.rollPrice = Math.round(p.price * p.roll_area);
            p.image = p.image || '';
            p.promotion = p.promotion || '';
        });
        populateFilters();
        applyFilters();
        updateCartBar();
        document.getElementById('updateDate').textContent = 'Демо-данные';
    }
}

function populateFilters() {
    const types = [...new Set(allProducts.map(p => p.type))].sort();
    const widths = [...new Set(allProducts.map(p => p.width))].sort((a, b) => a - b);
    const collections = [...new Set(allProducts.map(p => p.collection))].sort();
    const thicknesses = [...new Set(allProducts.map(p => p.thickness))].sort((a, b) => a - b);
    const wearLayers = [...new Set(allProducts.map(p => p.wearLayer))].sort((a, b) => a - b);
    
    fillSelect('filterType', types);
    fillSelect('filterWidth', widths, w => w + ' м');
    fillSelect('filterCollection', collections);
    fillSelect('filterThickness', thicknesses, t => t + ' мм');
    fillSelect('filterWearLayer', wearLayers, w => w + ' мм');
}

function fillSelect(id, values, format = v => v) {
    const select = document.getElementById(id);
    const firstOption = select.options[0];
    select.innerHTML = '';
    select.appendChild(firstOption);
    values.forEach(v => {
        const option = document.createElement('option');
        option.value = v;
        option.textContent = format(v);
        select.appendChild(option);
    });
}

let currentPromoFilter = ''; // '', 'action', 'sale'

function applyFilters() {
    const type = document.getElementById('filterType').value;
    const width = document.getElementById('filterWidth').value;
    const collection = document.getElementById('filterCollection').value;
    const thickness = document.getElementById('filterThickness').value;
    const wearLayer = document.getElementById('filterWearLayer').value;
    
    filteredProducts = allProducts.filter(p => {
        return (!type || p.type === type) &&
               (!width || p.width == width) &&
               (!collection || p.collection === collection) &&
               (!thickness || p.thickness == thickness) &&
               (!wearLayer || p.wearLayer == wearLayer) &&
               (!currentPromoFilter || p.promotion === currentPromoFilter);
    });
    
    renderProducts();
}

function renderProducts() {
    const grid = document.getElementById('productsGrid');
    document.getElementById('productCount').textContent = filteredProducts.length;
    
    if (filteredProducts.length === 0) {
        grid.innerHTML = `
            <div class="empty" style="grid-column: 1/-1;">
                <div class="empty-icon">🔍</div>
                <h3>Ничего не найдено</h3>
            </div>
        `;
        return;
    }
    
    grid.innerHTML = filteredProducts.map(product => {
        const inCart = cart.find(c => c.sku == product.sku);
        const qty = inCart ? inCart.qty : 1;
        const btnText = inCart ? '✓ Обновить в корзине' : '+ Добавить в корзину';
        const btnClass = inCart ? 'btn-success' : 'btn-primary';
        
        const imageHtml = product.image 
            ? `<img src="${product.image}" alt="${product.design}" onerror="this.parentElement.innerHTML='🏢'">`
            : '🏢';
        
        return `
        <div class="product-card">
            <div class="product-image">${imageHtml}</div>
            <div class="product-info">
                <div class="product-collection">${product.collection}</div>
                <div class="product-design">${product.design}</div>
                
                <div class="product-tags">
                    ${product.promotion === 'sale' ? '<span class="tag tag-sale">💥 Распродажа</span>' : ''}
                    ${product.promotion === 'action' ? '<span class="tag tag-action">🔥 Акция</span>' : ''}
                    <span class="tag tag-type">${product.type}</span>
                    <span class="tag tag-width">${product.width} м</span>
                    <span class="tag tag-thickness">${product.thickness} мм</span>
                    <span class="tag tag-stock">${Math.round(product.stock)} м²</span>
                </div>
                
                <div class="product-price-block">
                    <div class="price-roll">${product.rollPrice.toLocaleString('ru-RU')} ₽ <span class="price-label">за рулон</span></div>
                    <div class="price-m2">${product.price} ₽/м² • ${product.roll_area.toFixed(1)} м² в рулоне</div>
                </div>
                
                <div class="product-details">
                    <div class="detail-item">
                        <span class="detail-label">Защита:</span>
                        <span class="detail-value">${product.wearLayer} мм</span>
                    </div>
                </div>
                
                <div class="qty-selector">
                    <button class="qty-btn" onclick="changeQty('${product.sku}', -1)">−</button>
                    <input type="number" id="qty_${product.sku}" value="${qty}" min="1" max="100" readonly style="width:40px;text-align:center;border:1px solid #e0e0e0;border-radius:4px;padding:4px;">
                    <button class="qty-btn" onclick="changeQty('${product.sku}', 1)">+</button>
                </div>
                
                <div class="product-actions">
                    <button class="btn ${btnClass}" onclick="addToCart('${product.sku}')">
                        ${btnText}
                    </button>
                </div>
            </div>
        </div>
    `}).join('');
}

function changeQty(sku, delta) {
    const input = document.getElementById(`qty_${sku}`);
    if (!input) return;
    let val = parseInt(input.value) || 1;
    val += delta;
    if (val < 1) val = 1;
    if (val > 100) val = 100;
    input.value = val;
}

function addToCart(sku) {
    const product = allProducts.find(p => p.sku == sku);
    if (!product) return;
    
    const qtyInput = document.getElementById(`qty_${sku}`);
    const qty = qtyInput ? parseInt(qtyInput.value) || 1 : 1;
    
    const existing = cart.find(c => c.sku == sku);
    if (existing) {
        existing.qty = qty;
    } else {
        cart.push({
            sku: product.sku,
            design: product.design,
            collection: product.collection,
            type: product.type,
            width: product.width,
            price: product.price,        // цена за м²
            rollPrice: product.rollPrice, // цена за рулон
            rollArea: product.roll_area,  // м² в рулоне
            thickness: product.thickness,
            wearLayer: product.wearLayer,
            qty: qty
        });
    }
    
    saveCart();
    updateCartBar();
    applyFilters();
    
    const totalRollPrice = product.rollPrice * qty;
    if (existing) {
        alert(`Обновлено: ${product.design}\n${qty} рул × ${product.rollPrice.toLocaleString('ru-RU')} ₽ = ${totalRollPrice.toLocaleString('ru-RU')} ₽`);
    } else {
        alert(`Добавлено: ${product.design}\n${qty} рул × ${product.rollPrice.toLocaleString('ru-RU')} ₽ = ${totalRollPrice.toLocaleString('ru-RU')} ₽`);
    }
}

function removeFromCart(sku) {
    cart = cart.filter(c => c.sku != sku);
    saveCart();
    updateCartBar();
    renderCartItems();
    applyFilters();
}

function updateCartQty(sku, delta) {
    const item = cart.find(c => c.sku == sku);
    if (!item) return;
    
    item.qty += delta;
    if (item.qty <= 0) {
        removeFromCart(sku);
        return;
    }
    
    saveCart();
    updateCartBar();
    renderCartItems();
    applyFilters();
}

function saveCart() {
    localStorage.setItem('flooringCart', JSON.stringify(cart));
}

function updateCartBar() {
    const bar = document.getElementById('cartBar');
    const count = cart.reduce((sum, c) => sum + c.qty, 0);
    const total = cart.reduce((sum, c) => sum + (c.rollPrice * c.qty), 0);
    
    if (count > 0) {
        bar.style.display = 'flex';
        document.getElementById('cartCount').textContent = count;
        document.getElementById('cartBarTotal').textContent = total.toLocaleString('ru-RU') + ' ₽';
    } else {
        bar.style.display = 'none';
    }
}

function toggleCart() {
    const panel = document.getElementById('cartPanel');
    panel.classList.toggle('active');
    if (panel.classList.contains('active')) {
        renderCartItems();
    }
}

function renderCartItems() {
    const container = document.getElementById('cartItems');
    
    if (cart.length === 0) {
        container.innerHTML = `
            <div class="empty">
                <div class="empty-icon">🛒</div>
                <h3>Корзина пуста</h3>
            </div>
        `;
        return;
    }
    
    const total = cart.reduce((sum, c) => sum + (c.rollPrice * c.qty), 0);
    
    container.innerHTML = cart.map(item => `
        <div class="cart-item">
            <div class="cart-item-info">
                <div class="cart-item-name">${item.design}</div>
                <div class="cart-item-meta">${item.collection} • ${item.width} м • ${item.thickness} мм</div>
                <div class="cart-item-price">${item.rollPrice.toLocaleString('ru-RU')} ₽/рул</div>
            </div>
            <div class="cart-item-qty">
                <button class="qty-btn" onclick="updateCartQty(${item.sku}, -1)">−</button>
                <span>${item.qty}</span>
                <button class="qty-btn" onclick="updateCartQty(${item.sku}, 1)">+</button>
            </div>
            <div class="cart-item-sum">
                ${(item.rollPrice * item.qty).toLocaleString('ru-RU')} ₽
            </div>
            <button class="cart-item-remove" onclick="removeFromCart(${item.sku})">🗑</button>
        </div>
    `).join('') + `
        <div style="text-align: center; padding: 15px; font-size: 16px; font-weight: bold; border-top: 2px solid #667eea; margin-top: 10px;">
            Итого: ${total.toLocaleString('ru-RU')} ₽
        </div>
    `;
}

// PDF via html2canvas
async function showPDF() {
    if (cart.length === 0) {
        alert('Корзина пуста');
        return;
    }
    
    const tempDiv = document.createElement('div');
    tempDiv.style.cssText = 'position:fixed;left:-9999px;top:0;width:800px;background:white;padding:30px;font-family:Arial,sans-serif;';
    
    const total = cart.reduce((sum, c) => sum + (c.rollPrice * c.qty), 0);
    
    tempDiv.innerHTML = `
        <div style="text-align:center;margin-bottom:20px;">
            <h1 style="font-size:24px;margin-bottom:5px;">КОММЕРЧЕСКОЕ ПРЕДЛОЖЕНИЕ</h1>
            <p style="color:#666;">Линолеум Оптом</p>
            <p style="color:#666;">Дата: ${new Date().toLocaleDateString('ru-RU')}</p>
        </div>
        <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
            <tr style="background:#667eea;color:white;">
                <th style="padding:10px;text-align:left;">№</th>
                <th style="padding:10px;text-align:left;">Наименование</th>
                <th style="padding:10px;text-align:center;">Ширина</th>
                <th style="padding:10px;text-align:center;">Цена/рул</th>
                <th style="padding:10px;text-align:center;">Кол-во</th>
                <th style="padding:10px;text-align:right;">Сумма</th>
            </tr>
            ${cart.map((item, i) => `
                <tr style="border-bottom:1px solid #eee;">
                    <td style="padding:8px;">${i + 1}</td>
                    <td style="padding:8px;">${item.design}<br><small style="color:#666;">${item.collection}</small></td>
                    <td style="padding:8px;text-align:center;">${item.width} м</td>
                    <td style="padding:8px;text-align:center;">${item.rollPrice.toLocaleString('ru-RU')} ₽</td>
                    <td style="padding:8px;text-align:center;">${item.qty} рул</td>
                    <td style="padding:8px;text-align:right;font-weight:bold;">${(item.rollPrice * item.qty).toLocaleString('ru-RU')} ₽</td>
                </tr>
            `).join('')}
        </table>
        <div style="text-align:right;font-size:18px;font-weight:bold;margin-top:20px;">
            ИТОГО: ${total.toLocaleString('ru-RU')} ₽
        </div>
        <div style="margin-top:30px;padding-top:20px;border-top:2px solid #667eea;">
            <p style="color:#666;font-size:12px;">Телефон: +7 (XXX) XXX-XX-XX</p>
        </div>
    `;
    
    document.body.appendChild(tempDiv);
    
    try {
        const canvas = await html2canvas(tempDiv, { scale: 2 });
        pdfDataUrl = canvas.toDataURL('image/png');
        
        document.getElementById('pdfImage').src = pdfDataUrl;
        document.getElementById('pdfPreview').classList.add('active');
    } catch (e) {
        console.error(e);
        alert('Ошибка создания PDF');
    } finally {
        document.body.removeChild(tempDiv);
    }
}

function closePDF() {
    document.getElementById('pdfPreview').classList.remove('active');
}

function downloadPDF() {
    if (!pdfDataUrl) return;
    const link = document.createElement('a');
    link.download = `order_${Date.now()}.png`;
    link.href = pdfDataUrl;
    link.click();
}

// Share
function shareCart() {
    if (cart.length === 0) {
        alert('Корзина пуста');
        return;
    }
    
    const total = cart.reduce((sum, c) => sum + (c.rollPrice * c.qty), 0);
    let text = '📋 Заказ линолеума:\n\n';
    cart.forEach(item => {
        text += `• ${item.design}\n`;
        text += `  ${item.collection}, ${item.width}м, ${item.thickness}мм\n`;
        text += `  ${item.qty} рул × ${item.rollPrice.toLocaleString('ru-RU')}₽ = ${(item.rollPrice * item.qty).toLocaleString('ru-RU')}₽\n\n`;
    });
    text += `💰 ИТОГО: ${total.toLocaleString('ru-RU')} ₽`;
    
    if (navigator.share) {
        navigator.share({ title: 'Заказ линолеума', text: text });
    } else {
        window.open(`https://t.me/sanyaton?text=${encodeURIComponent(text)}`, '_blank');
    }
}

function shareShop() {
    const url = window.location.href;
    if (navigator.share) {
        navigator.share({ title: 'Линолеум Оптом', text: 'Каталог линолеума', url: url });
    } else {
        navigator.clipboard.writeText(url).then(() => alert('Ссылка скопирована!'));
    }
}

function filterPromo(promo) {
    if (currentPromoFilter === promo) {
        currentPromoFilter = '';
    } else {
        currentPromoFilter = promo;
    }
    
    // Reset select filters
    document.getElementById('filterType').value = '';
    document.getElementById('filterWidth').value = '';
    document.getElementById('filterCollection').value = '';
    document.getElementById('filterThickness').value = '';
    document.getElementById('filterWearLayer').value = '';
    
    applyFilters();
}

function showAll() {
    currentPromoFilter = '';
    document.getElementById('filterType').value = '';
    document.getElementById('filterWidth').value = '';
    document.getElementById('filterCollection').value = '';
    document.getElementById('filterThickness').value = '';
    document.getElementById('filterWearLayer').value = '';
    applyFilters();
}

// Event listeners
document.getElementById('filterType').addEventListener('change', applyFilters);
document.getElementById('filterWidth').addEventListener('change', applyFilters);
document.getElementById('filterCollection').addEventListener('change', applyFilters);
document.getElementById('filterThickness').addEventListener('change', applyFilters);
document.getElementById('filterWearLayer').addEventListener('change', applyFilters);

// Service Worker
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
}

// Load
loadProducts();
