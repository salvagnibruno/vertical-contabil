/**
 * Delta Gestão Pública — Auditor MSC
 * Auditoria instantânea da Matriz de Saldos Contábeis para o Ranking Siconfi
 */

(function () {
    'use strict';

    // ─── DOM References ───────────────────────────────────────────────────
    const fileInput         = document.getElementById('file-input');
    const dropZone          = document.getElementById('drop-zone');
    const generateSampleBtn = document.getElementById('generate-sample-btn');
    const resetBtn          = document.getElementById('reset-btn');
    const printBtn          = document.getElementById('print-report-btn');

    const uploadPanel      = document.getElementById('upload-panel');
    const processingPanel  = document.getElementById('processing-panel');
    const resultsPanel     = document.getElementById('results-panel');
    const procStatusText   = document.getElementById('proc-status');
    const icfValue         = document.getElementById('icf-value');
    const icfConcept       = document.getElementById('icf-concept');
    const icfBadge         = document.getElementById('icf-badge');
    const scoreBar         = document.getElementById('score-bar');
    const scoreLabel       = document.getElementById('score-label');
    const resultsFilename  = document.getElementById('results-filename');
    const rulesGrid        = document.getElementById('rules-grid');

    // ─── Audit Rule Definitions ────────────────────────────────────────────
    const RULES = [
        {
            id: 'header',
            title: 'Formatação do Cabeçalho',
            desc: 'A 1ª linha deve conter o Código IBGE + "EX" e o período no formato AAAA-MM (ex: 4314902EX;2026-03).',
        },
        {
            id: 'dcBalance',
            title: 'Equilíbrio Débito x Crédito',
            desc: 'O somatório de todos os lançamentos a Débito deve ser exatamente igual ao somatório a Crédito.',
        },
        {
            id: 'pcaspLevel',
            title: 'Contas no Nível Analítico (PCASP)',
            desc: 'A MSC exige contas de último nível de detalhamento do PCASP Estendido (7 partes separadas por ponto).',
        },
        {
            id: 'equity',
            title: 'Equilíbrio Patrimonial (A = P + PL)',
            desc: 'O saldo do Ativo (classe 1) deve ser igual à soma do Passivo (classe 2 exceto 2.3) com o Patrimônio Líquido (classe 2.3).',
        },
        {
            id: 'icFR',
            title: 'Informação Complementar — Fonte de Recursos',
            desc: 'Contas de Variação Patrimonial Aumentativa (classe 3) e Diminutiva (classe 4) exigem IC de Fonte de Recursos (FR).',
        },
    ];

    // ─── ICF Classification ───────────────────────────────────────────────
    function getICF(score) {
        if (score >= 95) return { label: 'A', text: 'Excelente', color: '#16a34a' };
        if (score >= 85) return { label: 'B', text: 'Ótimo',     color: '#2563eb' };
        if (score >= 75) return { label: 'C', text: 'Bom',       color: '#7c3aed' };
        if (score >= 65) return { label: 'D', text: 'Regular',   color: '#d97706' };
        return               { label: 'E', text: 'Insuficiente', color: '#c0392b' };
    }

    // ─── CSV Parser ───────────────────────────────────────────────────────
    function parseCSV(raw) {
        const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
        if (!lines.length) return null;

        return {
            header: lines[0],
            rows:   lines.slice(1).map(l => l.split(';')),
        };
    }

    // ─── Audit Engine ─────────────────────────────────────────────────────
    function audit(parsed) {
        const results = {};

        /* 1 ── Header check */
        const headerOk = /^\d{7}EX;\d{4}-(0[1-9]|1[0-3])$/.test(parsed.header);
        results.header = headerOk
            ? { status: 'ok',    detail: 'Cabeçalho no padrão Siconfi.', rec: 'Nenhuma ação necessária.' }
            : { status: 'error', detail: `Cabeçalho encontrado: "${parsed.header}"`, rec: 'Corrija para o formato: CODIGOIBGEEX;AAAA-MM  (ex: 4314902EX;2026-03). Verifique o separador ponto-e-vírgula.' };

        /* 2 ── D/C Balance */
        let totalD = 0, totalC = 0;
        let synthCount = 0;    // accounts with < 7 PCASP levels
        let missingFR  = 0;    // accounts needing Fonte de Recursos
        let ativo = 0, passivo = 0, pliq = 0;

        for (const parts of parsed.rows) {
            if (parts.length < 3) continue;

            const conta     = (parts[0] || '').trim();
            const natureza  = (parts[parts.length - 1] || '').trim().toUpperCase();
            const valorRaw  = (parts[parts.length - 2] || '0').trim().replace(',', '.');
            const valor     = parseFloat(valorRaw);

            if (!conta || isNaN(valor) || valor === 0) continue;

            // D/C tally
            if (natureza === 'D') totalD += valor;
            else if (natureza === 'C') totalC += valor;

            // PCASP level (expect 7 segments separated by dots)
            const segs = conta.split('.');
            if (segs.length < 7) synthCount++;

            // Patrimonial balance
            const pfx = conta.charAt(0);
            const signed = natureza === 'D' ? valor : -valor;
            if (pfx === '1') ativo   += signed;
            if (pfx === '2') {
                if (conta.startsWith('2.3')) pliq   += -signed;
                else                          passivo += -signed;
            }

            // FR check for classes 3 and 4
            if (pfx === '3' || pfx === '4') {
                let hasFR = false;
                // ICs are between conta and (valor;natureza) — middle columns
                for (let i = 1; i < parts.length - 2; i++) {
                    if ((parts[i] || '').trim().toUpperCase() === 'FR') { hasFR = true; break; }
                }
                if (!hasFR) missingFR++;
            }
        }

        /* 2 — D/C result */
        const diff = Math.abs(totalD - totalC);
        const hasTotals = totalD > 0 || totalC > 0;
        if (!hasTotals) {
            results.dcBalance = { status: 'warn', detail: 'Nenhum valor numérico encontrado no arquivo.', rec: 'Verifique se o separador decimal é ponto (.) e não vírgula, e se o arquivo está no layout correto.' };
        } else if (diff < 0.02) {
            results.dcBalance = { status: 'ok', detail: `Total D: R$ ${fmt(totalD)} | Total C: R$ ${fmt(totalC)}`, rec: 'O arquivo está equilibrado.' };
        } else {
            results.dcBalance = { status: 'error', detail: `Desequilíbrio de R$ ${fmt(diff)} (D: ${fmt(totalD)} / C: ${fmt(totalC)})`, rec: 'Revise os lançamentos de encerramento. Verifique se todos os contra-lançamentos foram inseridos e se não há contas com natureza invertida.' };
        }

        /* 3 — PCASP level */
        if (synthCount === 0) {
            results.pcaspLevel = { status: 'ok', detail: 'Todas as contas estão no nível analítico.', rec: 'Nenhuma ação necessária.' };
        } else {
            results.pcaspLevel = { status: 'warn', detail: `${synthCount} conta(s) com menos de 7 segmentos no PCASP.`, rec: 'O Siconfi rejeita contas em nível sintético. Desdobre ao máximo as contas e utilize os códigos de último nível do PCASP Estendido.' };
        }

        /* 4 — Equity */
        const equityDiff = Math.abs(ativo - (passivo + pliq));
        const hasEquity  = ativo !== 0 || passivo !== 0 || pliq !== 0;
        if (!hasEquity) {
            results.equity = { status: 'warn', detail: 'Não foi possível calcular (sem contas das classes 1 e 2).', rec: 'Certifique-se de que a MSC contém contas patrimoniais (classes 1 e 2) para a verificação de equilíbrio.' };
        } else if (equityDiff < 1) {
            results.equity = { status: 'ok', detail: `Ativo: ${fmt(ativo)} | P+PL: ${fmt(passivo + pliq)}`, rec: 'O equilíbrio patrimonial está correto.' };
        } else {
            results.equity = { status: 'error', detail: `Divergência de R$ ${fmt(equityDiff)} (Ativo: ${fmt(ativo)} | P+PL: ${fmt(passivo+pliq)})`, rec: 'Verifique se o Superávit/Déficit do exercício foi transferido corretamente para o Patrimônio Líquido e se não há contas patrimoniais com natureza invertida.' };
        }

        /* 5 — IC FR */
        if (missingFR === 0) {
            results.icFR = { status: 'ok', detail: 'Todas as contas de variação possuem IC de Fonte de Recursos.', rec: 'Nenhuma ação necessária.' };
        } else {
            results.icFR = { status: 'warn', detail: `${missingFR} lançamento(s) sem IC de Fonte de Recursos.`, rec: 'Inclua a coluna de Fonte de Recursos (FR) para contas das classes 3 e 4. O Siconfi penaliza a ausência deste campo obrigatório.' };
        }

        /* Score calculation */
        const penalties = {
            header:    { error: 10, warn: 5 },
            dcBalance: { error: 35, warn: 10 },
            pcaspLevel:{ error: 20, warn: 10 },
            equity:    { error: 25, warn: 8  },
            icFR:      { error: 15, warn: 8  },
        };

        let deduction = 0;
        for (const [key, r] of Object.entries(results)) {
            if (r.status === 'error') deduction += penalties[key].error;
            else if (r.status === 'warn') deduction += penalties[key].warn;
        }

        return { ruleResults: results, score: Math.max(0, 100 - deduction) };
    }

    // ─── Helpers ──────────────────────────────────────────────────────────
    function fmt(n) {
        return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    function statusLabel(s) {
        return s === 'ok' ? 'Regular' : s === 'warn' ? 'Alerta' : s === 'error' ? 'Crítico' : 'Pendente';
    }

    // ─── UI — Show / Hide panels ──────────────────────────────────────────
    function showPanel(id) {
        [uploadPanel, processingPanel, resultsPanel].forEach(p => p.classList.add('hidden'));
        document.getElementById(id).classList.remove('hidden');
    }

    // ─── UI — Render results ──────────────────────────────────────────────
    function renderResults(data, filename) {
        const icf = getICF(data.score);

        // ICF Badge
        icfValue.textContent   = icf.label;
        icfConcept.textContent = `${icf.text} — ${data.score}%`;
        icfBadge.style.background = icf.color;

        // Score bar
        scoreLabel.textContent = data.score + '%';
        scoreBar.style.width = data.score + '%';

        // Filename
        resultsFilename.textContent = `Arquivo analisado: ${filename}`;

        // Rule cards
        rulesGrid.innerHTML = '';
        for (const rule of RULES) {
            const r = data.ruleResults[rule.id];
            if (!r) continue;

            const card = document.createElement('div');
            card.className = `rule-card status-${r.status}`;
            card.innerHTML = `
                <div class="rule-card-header">
                    <span class="rule-card-title">${rule.title}</span>
                    <span class="status-chip">${statusLabel(r.status)}</span>
                </div>
                <p class="rule-card-desc">${r.detail}</p>
                <div class="rule-card-rec">${r.status === 'ok' ? '✓ ' : '⚠ '}${r.rec}</div>
            `;
            rulesGrid.appendChild(card);
        }

        showPanel('results-panel');
    }

    // ─── File Processing ──────────────────────────────────────────────────
    function processFile(file) {
        if (!file.name.toLowerCase().endsWith('.csv')) {
            alert('Por favor, envie um arquivo no formato .csv');
            return;
        }

        showPanel('processing-panel');
        procStatusText.textContent = 'Lendo o arquivo...';

        const reader = new FileReader();

        reader.onload = (e) => {
            procStatusText.textContent = 'Auditando a MSC...';
            // Use requestAnimationFrame so the UI updates before the sync audit runs
            requestAnimationFrame(() => {
                const parsed = parseCSV(e.target.result);
                if (!parsed || !parsed.rows.length) {
                    alert('Arquivo CSV vazio ou inválido.');
                    showPanel('upload-panel');
                    return;
                }
                const data = audit(parsed);
                renderResults(data, file.name);
                procStatusText.textContent = 'Concluído!';
            });
        };

        reader.onerror = () => {
            alert('Erro ao ler o arquivo. Tente novamente.');
            showPanel('upload-panel');
        };

        reader.readAsText(file, 'UTF-8');
    }

    // ─── Event Listeners ──────────────────────────────────────────────────

    // File input
    fileInput.addEventListener('change', (e) => {
        if (e.target.files[0]) processFile(e.target.files[0]);
    });

    // Drag & drop
    dropZone.addEventListener('dragover',  (e) => { e.preventDefault(); dropZone.classList.add('dz-active'); });
    dropZone.addEventListener('dragleave', ()  => dropZone.classList.remove('dz-active'));
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dz-active');
        if (e.dataTransfer.files[0]) processFile(e.dataTransfer.files[0]);
    });

    // Keyboard accessibility for drop zone
    dropZone.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') fileInput.click();
    });

    // Reset
    resetBtn.addEventListener('click', () => {
        fileInput.value = '';
        showPanel('upload-panel');
    });

    // Print / PDF
    printBtn.addEventListener('click', () => window.print());

    // Sample CSV generator
    generateSampleBtn.addEventListener('click', () => {
        // Balanced sample: D total = C total
        const csv = [
            '4314902EX;2026-03',
            // Ativo
            '1.1.1.1.1.01.00;FR;1500;350000.00;D',
            '1.2.2.1.1.01.00;FR;1500;150000.00;D',
            // Passivo
            '2.1.1.1.1.01.00;FR;1500;200000.00;C',
            // PL
            '2.3.1.1.1.01.00;FR;1500;300000.00;C',
            // VPA / VPD
            '3.1.1.1.1.01.00;FR;1500;80000.00;C',
            '4.1.1.1.1.01.00;FR;1500;80000.00;D',
        ].join('\n');

        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url  = URL.createObjectURL(blob);
        const a    = Object.assign(document.createElement('a'), { href: url, download: 'MSC_Exemplo_Delta.csv' });
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    });

})();
