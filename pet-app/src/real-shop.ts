import { api, ApiError } from './api';
import { idempotencyKey, type Locale } from './types';
import type { RealProduct, RealVoucher } from './real-shop-types';
import './styles/real-shop.css';

const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
type Pending = { productId: string; price: number; name: string; key: string };
type Student = { studentId: string; name: string; className?: string; classNo?: number };

export class RealShop {
  private products: RealProduct[] = [];
  private vouchers: RealVoucher[] = [];
  private nextCursor: string | null = null;
  private section = 'products';
  private code = '';
  private busy = false;
  private generation = 0;
  private pending: Pending | null = null;
  private zh: boolean;
  constructor(private root: HTMLElement, private locale: Locale, private teacher: boolean,
    private studentId = '', private balance = 0, private onBalance: (balance: number) => void = () => {}, private roster: Student[] = [], private teacherName = '') {
    this.zh = locale === 'zh-HK';
    try { this.pending = JSON.parse(sessionStorage.getItem(this.pendingKey) || 'null'); } catch { /* private browsing */ }
  }
  private get pendingKey() { return `pet-real-purchase:${this.studentId}`; }
  private t(zh: string, en: string) { return this.zh ? zh : en; }
  private date(value: string) { return new Date(value).toLocaleString(this.locale, { timeZone: 'Asia/Hong_Kong' }); }
  private image(url: string, name: string) { return url ? `<img class="real-product-image" src="${esc(url)}" alt="${esc(name)}" loading="lazy">` : '<div class="real-product-placeholder" aria-hidden="true">🎁</div>'; }
  private message(value: string, error = false) { const node = this.root.querySelector<HTMLElement>('.real-message'); if (node) { node.textContent = value; node.classList.toggle('error', error); } }
  async init() { await this.load(); }

  private async load(append = false) {
    const generation = ++this.generation;
    if (!append) this.shell(this.t('載入中…', 'Loading…'));
    try {
      if (this.section === 'products') this.products = (await api.realProducts(this.teacher)).products;
      else {
        const page = await api.realVouchers(this.teacher, this.code, append ? this.nextCursor || '' : '');
        if (generation !== this.generation || !this.root.isConnected) return;
        this.vouchers = append ? [...this.vouchers, ...page.vouchers] : page.vouchers; this.nextCursor = page.nextCursor;
      }
      if (generation !== this.generation || !this.root.isConnected) return;
      this.render();
    } catch (error) { if (generation === this.generation) this.message((error as Error).message, true); }
  }

  private shell(message = '') {
    this.root.innerHTML = `<div class="real-shop"><header class="real-shop-head"><p class="eyebrow">PET PARADISE · REWARDS</p><h1>${this.t('實體商店', 'Reward Shop')}</h1><p>${this.teacher ? this.t('上架實物獎品，以樂園金幣換領；派發物品前，請核對學生及換領券。', 'List real rewards for paradise coins. Check the student and voucher before handing over an item.') : this.t('用樂園金幣換購真實禮物，購買後帶換領券找老師領取。', 'Spend paradise coins on real gifts. Show your voucher to a teacher to collect your reward.')}</p>${!this.teacher ? `<strong class="real-balance">🪙 ${this.balance.toLocaleString()} ${this.t('金幣', 'coins')}</strong>` : ''}</header><div class="filter-row real-tabs"><button type="button" data-section="products" class="${this.section === 'products' ? 'active' : ''}" aria-pressed="${this.section === 'products'}">${this.t(this.teacher ? '商品管理' : '選購商品', this.teacher ? 'Manage products' : 'Browse rewards')}</button><button type="button" data-section="vouchers" class="${this.section === 'vouchers' ? 'active' : ''}" aria-pressed="${this.section === 'vouchers'}">${this.t(this.teacher ? '換領券核銷' : '我的換領券', this.teacher ? 'Redeem vouchers' : 'My vouchers')}</button><button type="button" data-refresh>${this.t('重新整理', 'Refresh')}</button></div><p class="real-message" role="status" aria-live="polite">${esc(message)}</p><div class="real-pending"></div><div class="real-content"></div><dialog class="real-dialog"></dialog></div>`;
    this.root.querySelectorAll<HTMLButtonElement>('[data-section]').forEach(button => button.onclick = () => { if (this.busy) return; this.section = button.dataset.section!; void this.load(); });
    this.root.querySelector<HTMLButtonElement>('[data-refresh]')!.onclick = () => { if (!this.busy) void this.load(); };
  }

  private render() {
    this.shell();
    const content = this.root.querySelector<HTMLElement>('.real-content')!;
    if (!this.teacher && this.pending) {
      const banner = this.root.querySelector<HTMLElement>('.real-pending')!;
      banner.innerHTML = `<p>${this.t('上次購買尚待確認。重試會核對同一筆交易，不會重複扣款。', 'Your last purchase needs confirmation. Retry checks the same transaction without charging twice.')} <b>${esc(this.pending.name)}</b></p><button type="button" data-recover>${this.t('確認上次購買', 'Check last purchase')}</button>`;
      banner.querySelector<HTMLButtonElement>('[data-recover]')!.onclick = () => this.confirmPurchase(this.pending!);
    }
    if (this.section === 'products') {
      content.innerHTML = `${this.teacher ? `<button type="button" class="primary" data-new>${this.t('＋ 新增商品', '+ Add product')}</button><div class="real-editor"></div>` : ''}<div class="real-product-grid">${this.products.map(product => `<article class="real-product-card">${this.image(product.imageUrl, product.name)}<div class="real-card-body"><span class="real-state">${product.active ? this.t('上架中', 'Available') : this.t('已下架', 'Unlisted')}</span><h2>${esc(product.name)}</h2><p class="real-description">${esc(product.description)}</p><p class="real-teacher">${this.t("領取老師", "Collect from")}: <b>${esc(product.listedByName || product.listedBy)}</b></p><p>${product.stock === null ? this.t('不限量', 'Unlimited stock') : `${this.t('剩餘', 'Remaining')}: ${product.stock}`}</p><strong>🪙 ${product.price.toLocaleString()}</strong><button type="button" data-product="${product.id}" ${!this.teacher && (product.stock === 0 || this.balance < product.price || this.pending) ? 'disabled' : ''}>${this.teacher ? this.t('編輯商品', 'Edit product') : product.stock === 0 ? this.t('已售罄', 'Sold out') : this.balance < product.price ? this.t('金幣不足', 'Not enough coins') : this.t('購買', 'Buy')}</button></div></article>`).join('') || `<p class="empty-state">${this.t('暫時沒有上架商品。', 'No rewards are listed yet.')}</p>`}</div>`;
      content.querySelector<HTMLButtonElement>('[data-new]')?.addEventListener('click', () => this.editProduct());
      content.querySelectorAll<HTMLButtonElement>('[data-product]').forEach(button => button.onclick = () => {
        const product = this.products.find(p => p.id === button.dataset.product)!;
        if (this.teacher) this.editProduct(product);
        else this.confirmPurchase({ productId: product.id, name: product.name, price: product.price, key: idempotencyKey() });
      });
    } else this.renderVouchers(content);
  }

  private showDialog(html: string) {
    const dialog = this.root.querySelector<HTMLDialogElement>('dialog')!;
    dialog.innerHTML = html;
    dialog.oncancel = event => { if (this.busy) event.preventDefault(); };
    dialog.querySelector<HTMLButtonElement>('[data-cancel]')!.onclick = () => dialog.close();
    dialog.showModal();
    return dialog;
  }

  private confirmPurchase(pending: Pending) {
    if (this.busy) return;
    const dialog = this.showDialog(`<h2>${this.t('確認購買', 'Confirm purchase')}</h2><h3>${esc(pending.name)}</h3><p>${this.t('將扣除', 'Cost')}: <b>🪙 ${pending.price.toLocaleString()}</b></p><p>${this.t('購買後會得到一張換領券，請向老師出示並領取實物。', 'You will receive a voucher. Show it to a teacher to collect the real item.')}</p><p role="status"></p><div class="real-actions"><button type="button" data-cancel>${this.t('返回', 'Back')}</button><button type="button" class="primary" data-confirm>${this.t('確認購買', 'Confirm purchase')}</button></div>`);
    dialog.querySelector<HTMLButtonElement>('[data-confirm]')!.onclick = async () => {
      if (this.busy) return;
      this.busy = true; dialog.querySelectorAll<HTMLButtonElement>('button').forEach(b => b.disabled = true);
      this.pending = pending;
      try { sessionStorage.setItem(this.pendingKey, JSON.stringify(pending)); } catch { /* in-memory key still protects retries */ }
      try {
        const result = await api.buyRealProduct(pending.productId, pending.price, pending.key);
        this.balance = result.balance; this.onBalance(result.balance); this.clearPending();
        dialog.close(); this.section = 'vouchers'; this.busy = false;
        await this.load();
        this.message(this.t('購買成功！請向老師出示換領券。', 'Purchase complete! Show your voucher to a teacher.'));
      } catch (error) {
        // HTTP refusals are definitive; network errors/5xx retain the same key across reloads.
        if (error instanceof ApiError && error.status >= 400 && error.status < 500) this.clearPending();
        dialog.querySelector<HTMLElement>('[role="status"]')!.textContent = (error as Error).message;
      } finally { this.busy = false; dialog.querySelectorAll<HTMLButtonElement>('button').forEach(b => b.disabled = false); }
    };
    dialog.onclose = () => { if (!this.busy && this.root.contains(dialog)) this.render(); };
  }
  private clearPending() { this.pending = null; try { sessionStorage.removeItem(this.pendingKey); } catch { /* unavailable storage */ } }

  private studentLabel(voucher: RealVoucher) {
    const student = this.roster.find(row => row.studentId === voucher.studentId);
    return student ? `${student.name} · ${student.className || ''} ${student.classNo || ''} · ${student.studentId}` : voucher.studentId;
  }
  private voucherCard(voucher: RealVoucher) {
    return `<article class="real-voucher ${voucher.redeemedAt ? 'redeemed' : ''}">${this.image(voucher.imageUrl, voucher.name)}<div><span class="real-state">${voucher.redeemedAt ? this.t('已核銷・請勿重複派發', 'Redeemed · do not issue again') : this.t('待領取', 'Ready to collect')}</span><h2>${esc(voucher.name)}</h2><p class="real-teacher">${this.t("領取老師", "Collect from")}: <b>${esc(voucher.listedByName || voucher.listedBy)}</b></p><p>${esc(this.teacher ? this.studentLabel(voucher) : this.studentId)}</p><code>${esc(voucher.code)}</code><p>🪙 ${voucher.price.toLocaleString()} · ${esc(this.date(voucher.purchasedAt))}</p>${voucher.redeemedAt ? `<p>${this.t('核銷時間', 'Redeemed')}: ${esc(this.date(voucher.redeemedAt))}<br>${this.t('核銷老師', 'Teacher')}: ${esc(voucher.redeemedBy)}</p>` : `<p>${this.t('請在派發實物時由老師核銷一次。', 'A teacher redeems this voucher once when handing over the item.')}</p>${this.teacher ? `<button type="button" class="primary" data-redeem="${esc(voucher.code)}">${this.t('核對並核銷', 'Review and redeem')}</button>` : ''}`}</div></article>`;
  }
  private renderVouchers(content: HTMLElement) {
    content.innerHTML = `${this.teacher ? `<form class="real-lookup"><label class="field"><span>${this.t('輸入學生的換領碼', 'Enter the student’s voucher code')}</span><input name="code" placeholder="RW-XXXX-XXXX-XXXX-XXXX" value="${esc(this.code)}" maxlength="40"></label><button class="primary">${this.t('查找換領券', 'Find voucher')}</button><button type="button" data-all>${this.t('全部紀錄', 'All records')}</button></form>` : ''}<div class="real-vouchers">${this.vouchers.map(v => this.voucherCard(v)).join('') || `<p class="empty-state">${this.t(this.code ? '找不到這張換領券。' : '暫時沒有換領券。', this.code ? 'No matching voucher.' : 'No vouchers yet.')}</p>`}</div>${this.nextCursor ? `<button type="button" data-more>${this.t('載入更多', 'Load more')}</button>` : ''}`;
    content.querySelector('form')?.addEventListener('submit', event => { event.preventDefault(); this.code = new FormData(event.currentTarget as HTMLFormElement).get('code')!.toString().trim(); void this.load(); });
    content.querySelector<HTMLButtonElement>('[data-all]')?.addEventListener('click', () => { this.code = ''; void this.load(); });
    content.querySelector<HTMLButtonElement>('[data-more]')?.addEventListener('click', event => { (event.currentTarget as HTMLButtonElement).disabled = true; void this.load(true); });
    content.querySelectorAll<HTMLButtonElement>('[data-redeem]').forEach(button => button.onclick = () => {
      const voucher = this.vouchers.find(v => v.code === button.dataset.redeem)!;
      const dialog = this.showDialog(`<h2>${this.t('確認派發實物及核銷', 'Confirm handover and redemption')}</h2><p>${esc(this.studentLabel(voucher))}</p><h3>${esc(voucher.name)}</h3><code>${esc(voucher.code)}</code><p>${this.t('請核對學生身分，並在派發這件物品時確認。每張券只可領取一次。', 'Check the student’s identity and confirm while handing over this item. Each voucher can only be redeemed once.')}</p><p role="status"></p><div class="real-actions"><button type="button" data-cancel>${this.t('取消', 'Cancel')}</button><button type="button" class="primary" data-confirm>${this.t('已派發，確認核銷', 'Handed over · redeem')}</button></div>`);
      dialog.querySelector<HTMLButtonElement>('[data-confirm]')!.onclick = async () => {
        if (this.busy) return; this.busy = true; dialog.querySelectorAll<HTMLButtonElement>('button').forEach(b => b.disabled = true);
        try {
          const result = await api.redeemRealVoucher(voucher.code); dialog.close(); this.busy = false; await this.load();
          this.message(result.alreadyRedeemed ? this.t('這張券已經核銷，請勿再次派發。', 'Already redeemed. Do not hand over another item.') : this.t('核銷成功，已記錄領取時間。', 'Redeemed. Collection time recorded.'), result.alreadyRedeemed);
        } catch (error) { dialog.querySelector<HTMLElement>('[role="status"]')!.textContent = (error as Error).message; }
        finally { this.busy = false; dialog.querySelectorAll<HTMLButtonElement>('button').forEach(b => b.disabled = false); }
      };
    });
  }

  private editProduct(product?: RealProduct) {
    if (this.busy) return;
    const editor = this.root.querySelector<HTMLElement>('.real-editor')!;
    const id = product?.id || idempotencyKey(), revision = product?.revision || 0;
    let imageId = product?.imageId || null;
    editor.innerHTML = `<form class="real-product-form"><p class="real-teacher">${this.t("上架／領取老師", "Listing / collection teacher")}: <b>${esc(product?.listedByName || this.teacherName)}</b></p><h2>${this.t(product ? '編輯商品' : '新增商品', product ? 'Edit product' : 'Add product')}</h2><label class="field"><span>${this.t('商品名稱', 'Product name')}</span><input name="name" value="${esc(product?.name)}" maxlength="80" required></label><label class="field"><span>${this.t('商品說明／領取須知', 'Description / collection instructions')}</span><textarea name="description" maxlength="600" rows="3">${esc(product?.description)}</textarea></label><div class="real-form-grid"><label class="field"><span>${this.t('價錢（金幣）', 'Price (coins)')}</span><input name="price" type="number" min="1" max="1000000" step="1" value="${product?.price || ''}" required></label><label class="field"><span>${this.t('可售庫存（留空不限量）', 'Available stock (blank = unlimited)')}</span><input name="stock" type="number" min="0" max="1000000" step="1" value="${product?.stock ?? ''}"></label></div><label class="field"><span>${this.t('商品圖片（JPG／PNG／WebP，最多 8 MB）', 'Product image (JPG / PNG / WebP, up to 8 MB)')}</span><input name="image" type="file" accept="image/jpeg,image/png,image/webp"></label><div class="real-image-preview">${product?.imageUrl ? this.image(product.imageUrl, product.name) : ''}</div><label class="real-checkbox"><input name="active" type="checkbox" ${product?.active !== false ? 'checked' : ''}>${this.t('上架，讓學生可以購買', 'List for students to buy')}</label><p class="real-editor-message" role="status"></p><div class="real-actions"><button type="button" data-cancel-edit>${this.t('取消', 'Cancel')}</button><button type="submit" class="primary">${this.t('儲存商品', 'Save product')}</button></div></form>`;
    const form = editor.querySelector('form')!, status = editor.querySelector<HTMLElement>('[role="status"]')!;
    const save = form.querySelector<HTMLButtonElement>('[type="submit"]')!;
    editor.querySelector<HTMLButtonElement>('[data-cancel-edit]')!.onclick = () => { if (!this.busy) editor.innerHTML = ''; };
    form.querySelector<HTMLInputElement>('[name="image"]')!.onchange = async event => {
      const file = (event.target as HTMLInputElement).files?.[0]; if (!file) return;
      if (file.size > 8 * 1024 * 1024) { status.textContent = this.t('圖片不能超過 8 MB。', 'Image must be 8 MB or less.'); (event.target as HTMLInputElement).value = ''; return; }
      this.busy = true; save.disabled = true; status.textContent = this.t('正在上傳圖片…', 'Uploading image…');
      const imageInput = event.target as HTMLInputElement; imageInput.disabled = true;
      try { const result = await api.uploadRealImage(file); imageId = result.imageId; editor.querySelector('.real-image-preview')!.innerHTML = this.image(result.imageUrl, file.name); status.textContent = this.t('圖片已上傳。', 'Image uploaded.'); }
      catch (error) { status.textContent = (error as Error).message; imageInput.value = ''; }
      finally { this.busy = false; save.disabled = false; imageInput.disabled = false; }
    };
    form.onsubmit = async event => {
      event.preventDefault(); if (this.busy || !form.reportValidity()) return;
      const values = new FormData(form);
      this.busy = true; save.disabled = true;
      try {
        await api.saveRealProduct({ id, revision, name: String(values.get('name')), description: String(values.get('description')), price: Number(values.get('price')), stock: values.get('stock') === '' ? null : Number(values.get('stock')), active: values.get('active') === 'on', imageId });
        this.busy = false; await this.load(); this.message(this.t('商品已儲存。', 'Product saved.'));
      } catch (error) { status.textContent = (error as Error).message; }
      finally { this.busy = false; save.disabled = false; }
    };
    editor.scrollIntoView({ behavior: 'smooth', block: 'start' }); form.querySelector('input')?.focus();
  }
}
