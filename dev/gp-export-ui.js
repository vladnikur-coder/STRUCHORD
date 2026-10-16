function gpExportModal(title, bodyHtml, label) {
    const overlay = document.createElement('div');
    overlay.className = 'strum-modal-overlay';
    overlay.style.zIndex = '20000';
    const modal = document.createElement('div');
    modal.className = 'strum-modal-content';
    modal.style.maxWidth = 'min(94vw, 34rem)';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-label', label || title);
    modal.innerHTML = `<h3 style="margin:0;">${title}</h3>${bodyHtml}`;
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    overlay._releaseFocusTrap = trapFocus(modal, () => removeModalOverlay(overlay));
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) removeModalOverlay(overlay);
    });
    return { overlay, modal };
  }

  const GP_EXPORT_BUTTON_STYLE = 'padding:0.625rem 0;width:100%;border:0.0625rem solid var(--color-border-medium);border-radius:0.75rem;background:var(--color-surface-2);color:var(--color-text);font-size:1rem;cursor:pointer;';

  function gpExportFormatButton(caption, hint, id) {
    return `<div style="display:flex;flex-direction:column;gap:0.25rem;">
      <button type="button" id="${id}" style="${GP_EXPORT_BUTTON_STYLE}">${caption}</button>
      <p style="margin:0;font-size:0.8125rem;line-height:1.35;color:var(--color-text-secondary);">${hint}</p>
    </div>`;
  }

  function gpExportShowFormatDialog() {
    const { overlay, modal } = gpExportModal('Экспорт песни', `
      <p style="margin:0;font-size:0.9375rem;line-height:1.45;color:var(--color-text-secondary);">Куда сохранить текущую песню?</p>
      <div style="display:flex;flex-direction:column;gap:0.875rem;">
        ${gpExportFormatButton('<i class="ti ti-file-export"></i> Файл STRUCHORD (.struchord)', 'Полная копия песни: секции, партии, микшер, все эффекты и вложения. Открывается обратно в STRUCHORD без потерь.', 'gpExportStruchordBtn')}
        ${gpExportFormatButton('<i class="ti ti-music"></i> Guitar Pro 6 (.gpx)', 'Файл для Guitar Pro 6, 7 и 8: секции, такты, табулатура и ноты, темп, размер, тональность, микшер, капо, строй. После сохранения покажем, что перенеслось и что осталось в приложении.', 'gpExportGpBtn')}
        ${gpExportFormatButton('<i class="ti ti-music"></i> Guitar Pro 5 (.gp5)', 'Настоящий бинарный файл .gp5 для Guitar Pro 5: такты, табулатура, лирика, приёмы, повторы, темп, тональность, капо, строй и микшер. Повторы секций остаются повторами, а не копиями тактов.', 'gpExportGp5Btn')}
      </div>
      <button type="button" id="gpExportCancelBtn" style="${GP_EXPORT_BUTTON_STYLE}">Отмена</button>
    `, 'Экспорт песни');
    modal.querySelector('#gpExportCancelBtn').onclick = () => removeModalOverlay(overlay);
    modal.querySelector('#gpExportStruchordBtn').onclick = () => {
      removeModalOverlay(overlay);
      window.exportStruchordFile();
    };
    modal.querySelector('#gpExportGpBtn').onclick = () => {
      removeModalOverlay(overlay);
      window.exportGuitarPro();
    };
    modal.querySelector('#gpExportGp5Btn').onclick = () => {
      removeModalOverlay(overlay);
      window.exportGuitarPro5();
    };
  }

  function gpExportReportList(title, items, tone) {
    if (!items.length) return '';
    const rows = items.map((item) => `<li style="margin:0.125rem 0;">${item.label}${item.count ? ` — ${item.count}` : ''}</li>`).join('');
    const color = tone === 'loss' ? 'var(--color-text-secondary)' : 'var(--color-text)';
    return `<div style="display:flex;flex-direction:column;gap:0.375rem;">
      <h4 style="margin:0;font-size:0.9375rem;">${title}</h4>
      <ul style="margin:0;padding-left:1.125rem;font-size:0.875rem;line-height:1.4;color:${color};">${rows}</ul>
    </div>`;
  }

  function gpExportShowReport(report) {
    if (!report) return;
    const stats = report.stats || {};
    const summary = `Файл: ${report.fileName} · ${report.bytes.toLocaleString('ru-RU')} байт${report.container ? ` · контейнер ${report.container}` : ''}`;
    const body = `
      <p style="margin:0;font-size:0.9375rem;line-height:1.45;">Песня сохранена как <strong>${report.format}</strong>.</p>
      <p style="margin:0;font-size:0.875rem;line-height:1.4;color:var(--color-text-secondary);">${summary}</p>
      <p style="margin:0;font-size:0.875rem;line-height:1.4;color:var(--color-text-secondary);">Дорожек: ${stats.tracks || 0} · тактов: ${stats.bars || 0} · нот: ${stats.notes || 0} · долей: ${stats.beats || 0}.</p>
      ${gpExportReportList('Перенесено в файл', report.transferred, 'gain')}
      ${gpExportReportList('Не переносится или приблизительно', report.losses, 'loss')}
      <p style="margin:0;font-size:0.8125rem;line-height:1.4;color:var(--color-text-secondary);">Громкость и панорама в Guitar Pro хранятся 17 ступенями, поэтому округляются примерно на 6 % (панорама — на 12 %).</p>
      <button type="button" id="gpExportReportClose" style="${GP_EXPORT_BUTTON_STYLE}">Готово</button>
    `;
    const { overlay, modal } = gpExportModal('Отчёт об экспорте', body, 'Отчёт об экспорте в Guitar Pro');
    modal.querySelector('#gpExportReportClose').onclick = () => removeModalOverlay(overlay);
  }