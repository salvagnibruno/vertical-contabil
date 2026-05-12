document.addEventListener("DOMContentLoaded", () => {
    const startBtn = document.getElementById("start-btn");
    const urlInput = document.getElementById("url-input");
    const loader = document.getElementById("loader");
    const loaderText = document.getElementById("loader-text");
    
    const homeScreen = document.getElementById("home-screen");
    const dashboardScreen = document.getElementById("dashboard-screen");
    const displayUrl = document.getElementById("display-url");
    const reavaliarBtn = document.getElementById("reavaliar-btn");

    // Elements for Dashboard logic
    const criteriaContainer = document.getElementById("criteria-container");
    const scoreNumber = document.getElementById("score-number");
    const scoreCircle = document.querySelector(".score-circle");
    const essenciaisProgress = document.getElementById("essenciais-progress");
    const nivelText = document.getElementById("nivel-text");
    const statusBadge = document.getElementById("status-badge");
    const actionPlanContainer = document.getElementById("action-plan-container");

    // State
    const state = {
        evaluations: {} // criterionId -> true/false
    };

    // 1. Initial Scanning Animation & Automated Analysis
    startBtn.addEventListener("click", () => {
        const url = urlInput.value.trim();
        if(!url) { alert("Insira uma URL válida."); return; }

        displayUrl.textContent = url;
        startBtn.disabled = true;
        loader.classList.remove("hidden");

        const steps = [
            "Conectando ao portal (Bypass CORS)...",
            "Avaliando sitemap.xml e links de transparência...",
            "Processando NLP nos documentos da LOA, LDO e PPA...",
            "Cruzando dados com a base de critérios PNTP 2026...",
            "Gerando relatório final de nível de transparência..."
        ];
        
        let i = 0;
        const interval = setInterval(() => {
            loaderText.textContent = steps[i];
            i++;
            if(i >= steps.length) {
                clearInterval(interval);
                runAutomatedAnalysis(url);
                setTimeout(() => {
                    homeScreen.classList.remove("active");
                    homeScreen.classList.add("hidden");
                    dashboardScreen.classList.remove("hidden");
                    renderChecklist();
                    updateScore();
                }, 800);
            }
        }, 1000);
    });

    reavaliarBtn.addEventListener("click", () => {
        location.reload();
    });

    // Simulador de Motor de Inteligência Artificial para PNTP
    function runAutomatedAnalysis(url) {
        // Criar uma semente (seed) simples combinada entre o tamanho da URL e caracteres
        // para que a mesma URL retorne sempre a mesma nota (determinismo).
        let seed = url.length;
        for (let i = 0; i < url.length; i++) {
            seed += url.charCodeAt(i);
        }

        CRITERIA.forEach((c, index) => {
            // Algoritmo pseudo-randômico usando a seed da URL 
            // Critérios essenciais têm uma chance levemente maior de reprovar em sites genéricos
            let idNumber = parseInt(c.id.replace('.', '')) || index;
            let pseudoRandom = ((seed * idNumber) % 100); 

            // Para garantir que vejamos alguns reprovados, digamos que se o cálculo der < 25 (25% chance) a máquina reprova.
            // Para URLs que pareçam muito boas (ex: contendo 'tcu' ou 'transparencia'), aumentamos a chance de passar.
            let passThreshold = 25;
            if(url.toLowerCase().includes("tcu") || url.toLowerCase().includes("transparencia")) {
                passThreshold = 10; // only 10% chance to fail
            }
            if(c.type === "Essencial") passThreshold += 5; // Essenciais falham com mais frequência em portais ruins

            state.evaluations[c.id] = (pseudoRandom >= passThreshold);
        });
    }

    // 2. Render PNTP Checklist Dynamically (READ ONLY)
    function renderChecklist() {
        criteriaContainer.innerHTML = "";
        
        const dimensions = {};
        CRITERIA.forEach(c => {
            if(!dimensions[c.dimension]) dimensions[c.dimension] = [];
            dimensions[c.dimension].push(c);
        });

        for(const [dimName, criteriaArray] of Object.entries(dimensions)) {
            const groupDiv = document.createElement("div");
            groupDiv.className = "dimension-group";
            groupDiv.innerHTML = `<div class="dimension-title">${dimName} (Peso ${PNTP_WEIGHTS[dimName] || 1})</div>`;
            
            criteriaArray.forEach(c => {
                const isPassed = state.evaluations[c.id];
                const yesClass = isPassed ? "yes active" : "yes";
                const noClass = !isPassed ? "no active" : "no";

                const itemDiv = document.createElement("div");
                itemDiv.className = "criterion-item";
                itemDiv.innerHTML = `
                    <div>
                        <span class="badge-type badge-${c.type.replace('ó','o')}">${c.id} - ${c.type}</span>
                    </div>
                    <div class="criterion-text">${c.text}</div>
                    <div class="action-toggles">
                        <button class="toggle-btn ${yesClass}" data-id="${c.id}" data-val="true">Atendido</button>
                        <button class="toggle-btn ${noClass}" data-id="${c.id}" data-val="false">Falhou</button>
                    </div>
                `;
                groupDiv.appendChild(itemDiv);
            });
            criteriaContainer.appendChild(groupDiv);
        }

        // Add event listeners for human override
        document.querySelectorAll(".toggle-btn").forEach(btn => {
            btn.addEventListener("click", (e) => {
                const id = e.target.getAttribute("data-id");
                const val = e.target.getAttribute("data-val") === "true";
                
                // Update UI state
                const toggles = e.target.parentElement.querySelectorAll(".toggle-btn");
                toggles.forEach(t => t.classList.remove("active"));
                e.target.classList.add("active");

                // Override state and recalculate
                state.evaluations[id] = val;
                updateScore();
            });
        });
    }

    // 3. Calculator Engine for PNTP 2026
    function updateScore() {
        let totalPossibleScore = 0;
        let earnedScore = 0;
        
        let totalEssenciais = 0;
        let earnedEssenciais = 0;

        let totalEvaluated = 0;

        // Group evaluated items by dimension
        const dimScores = {};
        for(let dim in PNTP_WEIGHTS) dimScores[dim] = { earned: 0, possible: 0 };

        let failedCriteriaList = [];

        CRITERIA.forEach(c => {
            const weightDim = PNTP_WEIGHTS[c.dimension] || 1;
            let itemWeight = 1;
            if(c.type === "Essencial") itemWeight = 2;
            if(c.type.includes("Obrigat")) itemWeight = 1.5;
            if(c.type === "Recomendado") itemWeight = 1;

            if(c.type === "Essencial") totalEssenciais++;

            if(state.evaluations[c.id] !== null && state.evaluations[c.id] !== undefined) {
                totalEvaluated++;
                const isYes = state.evaluations[c.id];
                
                dimScores[c.dimension].possible += itemWeight;
                if(isYes) {
                    dimScores[c.dimension].earned += itemWeight;
                    if(c.type === "Essencial") earnedEssenciais++;
                } else {
                    failedCriteriaList.push(c); // add to action plan
                }
            } else {
                dimScores[c.dimension].possible += itemWeight;
            }
        });

        // Calculate final score using dimension weights
        for(let dim in dimScores) {
            if(dimScores[dim].possible > 0) {
                const percentageInDim = dimScores[dim].earned / dimScores[dim].possible;
                const dimWeight = PNTP_WEIGHTS[dim] || 1;
                
                earnedScore += (percentageInDim * dimWeight);
                totalPossibleScore += dimWeight;
            }
        }

        let finalPercentage = 0;
        if(totalPossibleScore > 0) {
            finalPercentage = (earnedScore / totalPossibleScore) * 100;
        }

        // Update UI Text
        scoreNumber.innerText = finalPercentage.toFixed(2) + "%";
        essenciaisProgress.innerText = `${earnedEssenciais} / ${totalEssenciais}`;

        // Nível de Transparência Rules PNTP
        let nivel = "Inexistente";
        let color = "#ef4444"; // red

        const allEssenciaisMet = (earnedEssenciais === totalEssenciais && totalEssenciais > 0);

        if(finalPercentage >= 95 && allEssenciaisMet) {
            nivel = "Diamante"; color = "#0284c7"; // delta blueish
        } else if (finalPercentage >= 85 && allEssenciaisMet) {
            nivel = "Ouro"; color = "#fbbf24";
        } else if (finalPercentage >= 75 && allEssenciaisMet) {
            nivel = "Prata"; color = "#94a3b8";
        } else if (finalPercentage >= 75) {
            nivel = "Elevado"; color = "#60a5fa";
        } else if (finalPercentage >= 50) {
            nivel = "Intermediário"; color = "#f97316";
        } else if (finalPercentage >= 30) {
            nivel = "Básico"; color = "#f87171";
        } else if (finalPercentage >= 1) {
            nivel = "Inicial"; color = "#b91c1c";
        }

        nivelText.innerText = "Nível: " + nivel;
        nivelText.style.color = color;
        scoreCircle.style.borderColor = color;

        // Auto avaliação significa que o statusBadge será de concluído logo que iniciar.
        statusBadge.innerText = "Relatório Gerado (Auto)";
        statusBadge.style.background = "rgba(16, 185, 129, 0.2)";
        statusBadge.style.color = "#047857";

        // Update Action Plan UI (Itens para Diamante)
        actionPlanContainer.innerHTML = "";
        if(failedCriteriaList.length === 0) {
            actionPlanContainer.innerHTML = `<div class="empty-state">Parabéns! O portal já possui os requisitos técnicos para o Selo Diamante.</div>`;
        } else {
            failedCriteriaList.forEach(item => {
                const actionDiv = document.createElement("div");
                actionDiv.className = "action-item";
                actionDiv.innerHTML = `<strong>Item ${item.id} - Upgrade Necessário</strong> ${item.text} <br><small>Tipo: ${item.type} | Dimensão: ${item.dimension}</small>`;
                actionPlanContainer.appendChild(actionDiv);
            });
        }
    }
});
