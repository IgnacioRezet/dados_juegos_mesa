/**
 * Vista de una hoja de personaje de El Anillo Unico.
 *
 * Construye un formulario fiel al PDF oficial a partir de `sheet-schema.js`.
 * - La hoja del jugador local es editable; las de los demas, solo lectura.
 * - Cada edicion emite `onEdit(field, value)` (el campo se identifica por su key
 *   del esquema). Los cambios entrantes se aplican con `applyUpdate` SIN volver a
 *   emitirlos (evita bucles de red).
 * - La presencia "quien edita este campo" se muestra resaltando el campo con el
 *   color del jugador (`setPresence`).
 *
 * Solo el dueno de una hoja puede editarla, asi que la presencia en una hoja
 * siempre proviene de su dueno: los demas ven en vivo en que campo escribe.
 */

import {
  getCulture,
  CHARACTER_FIELDS,
  ATTRIBUTES,
  ENDURANCE_FIELDS,
  HOPE_FIELDS,
  CONDITIONS,
  SKILL_COLUMNS,
  PROFICIENCIES,
  POINTS_FIELDS,
  VALOUR_FIELD,
  WISDOM_FIELD,
  TREASURE_FIELD,
  REWARDS_COLS,
  VIRTUES_COLS,
  WAR_GEAR_COLS,
  ARMOUR_COLS,
  SHIELD_FIELDS,
  PROTECTION_FIELDS,
  PARRY_FIELDS,
  SKILL_MAX,
} from './sheet-schema.js';

const el = (tag, cls, html) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  return n;
};

export class SheetView {
  /**
   * @param {object} opts
   * @param {object} opts.sheet  { playerId, culture, playerName, data }
   * @param {boolean} opts.isOwner  true si es la hoja del jugador local (editable)
   * @param {(field:string,value:any)=>void} opts.onEdit
   * @param {(field:string)=>void} opts.onFocus
   * @param {(field:string)=>void} opts.onBlur
   * @param {(playerId:string)=>string} opts.colorFor  color del jugador por id
   */
  constructor(opts) {
    this.sheet = opts.sheet;
    this.isOwner = !!opts.isOwner;
    this.onEdit = opts.onEdit || (() => {});
    this.onFocus = opts.onFocus || (() => {});
    this.onBlur = opts.onBlur || (() => {});
    this.onSave = opts.onSave || (() => {});
    this.colorFor = opts.colorFor || (() => '#7cc23a');

    this.controls = new Map();  // key -> { set(value), wrap }
    this.root = el('div', 'sheet');
    this._build();
  }

  data(key) {
    const v = this.sheet.data ? this.sheet.data[key] : undefined;
    return v == null ? '' : v;
  }

  /** Aplica un cambio remoto a un campo sin reemitirlo. */
  applyUpdate(field, value) {
    if (!this.sheet.data) this.sheet.data = {};
    this.sheet.data[field] = value;
    if (field === '_minimized') { this.setMinimized(value); return; }
    const ctrl = this.controls.get(field);
    if (ctrl) ctrl.set(value);
  }

  /** Pliega/despliega la hoja (estado sincronizado; solo el dueño lo cambia). */
  setMinimized(min) {
    const on = !!min;
    this.root.classList.toggle('minimized', on);
    if (this._minBtn) this._minBtn.textContent = on ? '▢' : '—';
    if (this._minBtn) this._minBtn.title = on ? 'Maximizar' : 'Minimizar';
  }

  /** Resalta (o limpia) el campo que esta editando `playerId`. */
  setPresence(field, playerId) {
    const ctrl = this.controls.get(field);
    if (!ctrl || !ctrl.wrap) return;
    if (playerId) {
      ctrl.wrap.classList.add('editing-by');
      ctrl.wrap.style.setProperty('--editor-color', this.colorFor(playerId));
    } else {
      ctrl.wrap.classList.remove('editing-by');
      ctrl.wrap.style.removeProperty('--editor-color');
    }
  }

  setName(name) {
    this.sheet.playerName = name;
    if (this._ownerLabel) this._ownerLabel.textContent = name;
  }

  // ----------------------------------------------------------------- helpers
  _emit(key, value) {
    this.sheet.data[key] = value;
    this.onEdit(key, value);
  }

  _wireFocus(node, key) {
    if (!this.isOwner) return;
    node.addEventListener('focus', () => this.onFocus(key));
    node.addEventListener('blur', () => this.onBlur(key));
  }

  // Campo de texto (una linea)
  _textField(key, { numeric } = {}) {
    const input = el('input', 'sf-text');
    input.type = 'text';
    if (numeric) input.classList.add('sf-num');
    input.value = this.data(key);
    input.disabled = !this.isOwner;
    input.addEventListener('input', () => this._emit(key, input.value));
    this._wireFocus(input, key);
    this.controls.set(key, { set: (v) => { input.value = v == null ? '' : v; }, wrap: input });
    return input;
  }

  // Caja numerica pequena (rating, TN, endurance, ...)
  _numBox(key) {
    const input = el('input', 'sf-box');
    input.type = 'text';
    input.inputMode = 'numeric';
    input.value = this.data(key);
    input.disabled = !this.isOwner;
    input.addEventListener('input', () => this._emit(key, input.value));
    this._wireFocus(input, key);
    this.controls.set(key, { set: (v) => { input.value = v == null ? '' : v; }, wrap: input });
    return input;
  }

  // Checkbox (conditions, favorita)
  _check(key, title) {
    const box = el('button', 'sf-check');
    if (title) box.title = title;
    box.type = 'button';
    const render = (v) => box.classList.toggle('on', !!v);
    render(this.data(key));
    if (this.isOwner) {
      box.addEventListener('click', () => {
        const v = !this.sheet.data[key];
        render(v);
        this._emit(key, v);
        // pulso de presencia para que se note quien marco
        this.onFocus(key);
        setTimeout(() => this.onBlur(key), 600);
      });
    } else {
      box.disabled = true;
    }
    this.controls.set(key, { set: render, wrap: box });
    return box;
  }

  // Fila de rombos 1..max para ratings (habilidades / proficiencias)
  _rating(key, max = SKILL_MAX) {
    const wrap = el('div', 'sf-rating');
    const pips = [];
    const render = (v) => {
      const n = parseInt(v, 10) || 0;
      pips.forEach((p, i) => p.classList.toggle('on', i < n));
    };
    for (let i = 0; i < max; i++) {
      const pip = el('button', 'sf-pip');
      pip.type = 'button';
      if (this.isOwner) {
        pip.addEventListener('click', () => {
          const current = parseInt(this.sheet.data[key], 10) || 0;
          const next = current === i + 1 ? i : i + 1; // reclick en el ultimo = baja uno
          render(next);
          this._emit(key, next);
          this.onFocus(key);
          setTimeout(() => this.onBlur(key), 600);
        });
      } else {
        pip.disabled = true;
      }
      pips.push(pip);
      wrap.appendChild(pip);
    }
    render(this.data(key));
    this.controls.set(key, { set: render, wrap });
    return wrap;
  }

  // Tabla repetible: el grupo se guarda como un ARRAY de filas en data[groupKey].
  // El dueño añade filas con "+" y las quita con "×"; el array completo se
  // sincroniza por sheetEdit. Los demás la ven en solo lectura y se re-renderiza
  // al llegar un cambio remoto (applyUpdate llama a set()).
  _repeatableTable(groupKey, cols, opts = {}) {
    const wrap = el('div', 'sf-repeat');
    const getArr = () => (Array.isArray(this.sheet.data[groupKey]) ? this.sheet.data[groupKey] : []);

    const header = el('div', 'sf-wg-row sf-wg-head');
    cols.forEach((c) => {
      const cell = el('span', 'sf-wg-cell', c.label);
      cell.style.flex = c.flex || 1;
      header.appendChild(cell);
    });
    if (this.isOwner) header.appendChild(el('span', 'sf-wg-actions'));
    wrap.appendChild(header);

    const rowsBox = el('div', 'sf-repeat-rows');
    wrap.appendChild(rowsBox);

    const renderRows = (arr) => {
      rowsBox.innerHTML = '';
      (Array.isArray(arr) ? arr : []).forEach((rowData, i) => {
        const row = el('div', 'sf-wg-row');
        cols.forEach((c) => {
          const input = el('input', 'sf-text');
          input.type = 'text';
          input.style.flex = c.flex || 1;
          input.value = rowData && rowData[c.key] != null ? rowData[c.key] : '';
          input.disabled = !this.isOwner;
          if (this.isOwner) {
            input.addEventListener('input', () => {
              const a = getArr();
              if (!a[i]) a[i] = {};
              a[i][c.key] = input.value;
              this.sheet.data[groupKey] = a;
              this.onEdit(groupKey, a);            // sincroniza el array completo
            });
            input.addEventListener('focus', () => this.onFocus(groupKey));
            input.addEventListener('blur', () => this.onBlur(groupKey));
          }
          row.appendChild(input);
        });
        if (this.isOwner) {
          const actions = el('span', 'sf-wg-actions');
          const del = el('button', 'sf-row-del', '×');
          del.type = 'button';
          del.title = 'Quitar fila';
          del.addEventListener('click', () => {
            const a = getArr();
            a.splice(i, 1);
            this.sheet.data[groupKey] = a;
            this.onEdit(groupKey, a);
            renderRows(a);
          });
          actions.appendChild(del);
          row.appendChild(actions);
        }
        rowsBox.appendChild(row);
      });
    };
    renderRows(getArr());

    if (this.isOwner) {
      const add = el('button', 'sf-row-add', '+ ' + (opts.addLabel || 'Añadir'));
      add.type = 'button';
      add.addEventListener('click', () => {
        const a = getArr();
        a.push({});
        this.sheet.data[groupKey] = a;
        this.onEdit(groupKey, a);
        renderRows(a);
      });
      wrap.appendChild(add);
    }

    // Registro para presencia + re-render ante cambios remotos.
    this.controls.set(groupKey, { set: (v) => renderRows(v), wrap });
    return wrap;
  }

  _labeledBox(field) {
    const cell = el('div', 'sf-stat');
    cell.appendChild(this._numBox(field.key));
    cell.appendChild(el('span', 'sf-stat-label', field.label));
    return cell;
  }

  // ------------------------------------------------------------------- build
  _build() {
    const culture = getCulture(this.sheet.culture);
    this.root.classList.add('culture-' + culture.id);
    this.root.style.setProperty('--sheet-accent', culture.accent);

    // Cabecera: nombre del jugador + cultura + (solo dueño) minimizar
    const head = el('div', 'sheet-head');
    this._ownerLabel = el('span', 'sheet-owner', this.sheet.playerName || 'Aventurero');
    head.appendChild(this._ownerLabel);
    const right = el('div', 'sheet-head-right');
    right.appendChild(el('span', 'sheet-culture', culture.name));
    if (this.isOwner) {
      this._minBtn = el('button', 'sheet-min', '—');
      this._minBtn.type = 'button';
      this._minBtn.title = 'Minimizar';
      this._minBtn.addEventListener('click', () => {
        const next = !this.root.classList.contains('minimized');
        this.setMinimized(next);
        this._emit('_minimized', next); // sincroniza con toda la sesión
      });
      right.appendChild(this._minBtn);
    }
    head.appendChild(right);
    this.root.appendChild(head);

    const body = el('div', 'sheet-body');
    body.appendChild(this._buildCharacter());
    body.appendChild(this._buildAttributes());
    body.appendChild(this._buildSkills());
    body.appendChild(this._buildSide());
    body.appendChild(this._buildCombat());

    // Pie con el boton "Guardar personaje" (solo el dueño guarda su hoja)
    if (this.isOwner) body.appendChild(this._buildFooter());

    this.root.appendChild(body);

    // Estado plegado inicial (persistido en la hoja)
    if (this.sheet.data && this.sheet.data._minimized) this.setMinimized(true);
  }

  _buildFooter() {
    const foot = el('div', 'sf-foot');
    this._saveBtn = el('button', 'sf-save-btn', '💾 Guardar personaje');
    this._saveBtn.type = 'button';
    this._saveStatus = el('span', 'sf-save-status', '');
    this._saveBtn.addEventListener('click', () => {
      this._saveBtn.disabled = true;
      this.setSaveStatus('saving');
      this.onSave();
    });
    foot.appendChild(this._saveBtn);
    foot.appendChild(this._saveStatus);
    return foot;
  }

  /** Refleja el resultado del guardado: 'saving' | 'ok' | 'error' | 'no-persistence'. */
  setSaveStatus(state, when) {
    if (this._saveBtn) this._saveBtn.disabled = state === 'saving';
    if (!this._saveStatus) return;
    const map = {
      saving: { text: 'Guardando…', cls: '' },
      ok: { text: `Guardado ✓${when ? ' ' + when : ''}`, cls: 'ok' },
      error: { text: 'Error al guardar', cls: 'err' },
      'no-persistence': { text: 'Sin Strapi: no se guardó', cls: 'err' },
    };
    const s = map[state] || { text: '', cls: '' };
    this._saveStatus.textContent = s.text;
    this._saveStatus.className = 'sf-save-status ' + s.cls;
  }

  _section(title, cls) {
    const s = el('section', 'sf-section ' + (cls || ''));
    s.appendChild(el('h3', 'sf-title', title));
    return s;
  }

  _buildCharacter() {
    const s = this._section('Personaje', 'sf-character');
    for (const f of CHARACTER_FIELDS) {
      const row = el('div', 'sf-row');
      row.appendChild(el('label', 'sf-label', f.label));
      row.appendChild(this._textField(f.key));
      s.appendChild(row);
    }
    // History (area de texto)
    const hist = el('div', 'sf-row sf-row-area');
    hist.appendChild(el('label', 'sf-label', 'Historia'));
    const area = el('textarea', 'sf-area');
    area.value = this.data('history');
    area.disabled = !this.isOwner;
    area.addEventListener('input', () => this._emit('history', area.value));
    this._wireFocus(area, 'history');
    this.controls.set('history', { set: (v) => { area.value = v == null ? '' : v; }, wrap: area });
    hist.appendChild(area);
    s.appendChild(hist);
    return s;
  }

  _buildAttributes() {
    const s = this._section('Fuerza · Corazón · Ingenio', 'sf-attributes');
    const grid = el('div', 'sf-attr-grid');
    for (const a of ATTRIBUTES) {
      const card = el('div', 'sf-attr');
      card.appendChild(el('span', 'sf-attr-name', a.label));
      const ratingBox = el('div', 'sf-attr-box');
      ratingBox.appendChild(this._numBox(a.key + 'Rating'));
      ratingBox.appendChild(el('span', 'sf-mini', 'Valor'));
      const tnBox = el('div', 'sf-attr-box');
      tnBox.appendChild(this._numBox(a.key + 'TN'));
      tnBox.appendChild(el('span', 'sf-mini', 'TN'));
      const row = el('div', 'sf-attr-row');
      row.appendChild(ratingBox);
      row.appendChild(tnBox);
      card.appendChild(row);
      grid.appendChild(card);
    }
    s.appendChild(grid);
    return s;
  }

  _buildSkills() {
    const s = this._section('Habilidades', 'sf-skills');
    const cols = el('div', 'sf-skill-cols');
    for (const column of SKILL_COLUMNS) {
      const c = el('div', 'sf-skill-col');
      for (const sk of column) {
        const row = el('div', 'sf-skill');
        row.appendChild(this._check(sk.key + 'Fav', 'Habilidad favorita'));
        row.appendChild(el('span', 'sf-skill-name', sk.label));
        row.appendChild(this._rating(sk.key));
        c.appendChild(row);
      }
      cols.appendChild(c);
    }
    s.appendChild(cols);

    // Combat proficiencies dentro del bloque de habilidades
    const prof = el('div', 'sf-prof');
    prof.appendChild(el('h4', 'sf-subtitle', 'Competencias de Combate'));
    for (const p of PROFICIENCIES) {
      const row = el('div', 'sf-skill');
      row.appendChild(el('span', 'sf-skill-name', p.label));
      row.appendChild(this._rating(p.key));
      prof.appendChild(row);
    }
    s.appendChild(prof);
    return s;
  }

  // Columna derecha: Endurance, Hope, Conditions, Rewards/Virtues, Puntos.
  _buildSide() {
    const s = this._section('Aguante · Esperanza', 'sf-side');

    const endur = el('div', 'sf-stat-row');
    endur.appendChild(el('h4', 'sf-subtitle', 'Aguante'));
    const eg = el('div', 'sf-stat-grid');
    ENDURANCE_FIELDS.forEach((f) => eg.appendChild(this._labeledBox(f)));
    endur.appendChild(eg);
    s.appendChild(endur);

    const hope = el('div', 'sf-stat-row');
    hope.appendChild(el('h4', 'sf-subtitle', 'Esperanza'));
    const hg = el('div', 'sf-stat-grid');
    HOPE_FIELDS.forEach((f) => hg.appendChild(this._labeledBox(f)));
    hope.appendChild(hg);
    s.appendChild(hope);

    const cond = el('div', 'sf-conditions');
    cond.appendChild(el('h4', 'sf-subtitle', 'Estados'));
    const cg = el('div', 'sf-cond-grid');
    for (const c of CONDITIONS) {
      const item = el('div', 'sf-cond');
      item.appendChild(this._check(c.key, c.label));
      item.appendChild(el('span', 'sf-cond-label', c.label));
      cg.appendChild(item);
    }
    cond.appendChild(cg);
    const injuryRow = el('div', 'sf-row');
    injuryRow.appendChild(el('label', 'sf-label', 'Herida'));
    injuryRow.appendChild(this._textField('injury'));
    cond.appendChild(injuryRow);
    s.appendChild(cond);

    // Rewards / Virtues / Puntos / Treasure
    const rv = el('div', 'sf-rewards');
    const valour = el('div', 'sf-stat');
    valour.appendChild(this._numBox(VALOUR_FIELD.key));
    valour.appendChild(el('span', 'sf-stat-label', `${VALOUR_FIELD.label} (${VALOUR_FIELD.sub})`));
    const wisdom = el('div', 'sf-stat');
    wisdom.appendChild(this._numBox(WISDOM_FIELD.key));
    wisdom.appendChild(el('span', 'sf-stat-label', `${WISDOM_FIELD.label} (${WISDOM_FIELD.sub})`));
    rv.appendChild(valour);
    rv.appendChild(wisdom);
    POINTS_FIELDS.forEach((f) => rv.appendChild(this._labeledBox(f)));
    rv.appendChild(this._labeledBox(TREASURE_FIELD));
    s.appendChild(rv);

    // Recompensas y Virtudes: listas repetibles (botón "+")
    const lists = el('div', 'sf-rv-lists');
    const rewards = el('div', 'sf-wargear');
    rewards.appendChild(el('h4', 'sf-subtitle', 'Recompensas'));
    rewards.appendChild(this._repeatableTable('rewards', REWARDS_COLS, { addLabel: 'Añadir recompensa' }));
    const virtues = el('div', 'sf-wargear');
    virtues.appendChild(el('h4', 'sf-subtitle', 'Virtudes'));
    virtues.appendChild(this._repeatableTable('virtues', VIRTUES_COLS, { addLabel: 'Añadir virtud' }));
    lists.appendChild(rewards);
    lists.appendChild(virtues);
    s.appendChild(lists);
    return s;
  }

  _buildCombat() {
    const s = this._section('Combate', 'sf-combat');

    // Equipo de Guerra: lista repetible (botón "+")
    const wargear = el('div', 'sf-wargear');
    wargear.appendChild(el('h4', 'sf-subtitle', 'Equipo de Guerra'));
    wargear.appendChild(this._repeatableTable('warGear', WAR_GEAR_COLS, { addLabel: 'Añadir arma' }));
    s.appendChild(wargear);

    // Armadura y Yelmo: lista repetible (botón "+")
    const armour = el('div', 'sf-wargear');
    armour.appendChild(el('h4', 'sf-subtitle', 'Armadura y Yelmo'));
    armour.appendChild(this._repeatableTable('armour', ARMOUR_COLS, { addLabel: 'Añadir armadura' }));
    s.appendChild(armour);

    // Escudo (campo único) + Protección / Parada totales
    const gear = el('div', 'sf-armour');
    SHIELD_FIELDS.forEach((f) => {
      const cell = el('div', 'sf-armour-cell');
      cell.appendChild(el('span', 'sf-mini', f.label));
      cell.appendChild(f.type === 'num' ? this._numBox(f.key) : this._textField(f.key));
      gear.appendChild(cell);
    });

    // Protection / Parry totales
    const totals = el('div', 'sf-totals');
    const prot = el('div', 'sf-total-block');
    prot.appendChild(el('span', 'sf-mini', 'Protección'));
    PROTECTION_FIELDS.forEach((f) => {
      const cell = el('div', 'sf-stat');
      cell.appendChild(this._numBox(f.key));
      cell.appendChild(el('span', 'sf-stat-label', f.label));
      prot.appendChild(cell);
    });
    const parry = el('div', 'sf-total-block');
    parry.appendChild(el('span', 'sf-mini', 'Parada'));
    PARRY_FIELDS.forEach((f) => {
      const cell = el('div', 'sf-stat');
      cell.appendChild(this._numBox(f.key));
      cell.appendChild(el('span', 'sf-stat-label', f.label));
      parry.appendChild(cell);
    });
    totals.appendChild(prot);
    totals.appendChild(parry);

    s.appendChild(gear);
    s.appendChild(totals);
    return s;
  }
}
