const SUPABASE_URL = "https://ugyrxgpffvrmzomldibk.supabase.co";
const SUPABASE_KEY = "sb_publishable_hoyDXLDeGE51ney2E7e-FA_m8owsM0";

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let usuarioAtual = null;
let mesAtual = new Date().getMonth();
let anoAtual = new Date().getFullYear();
let perfilUsuario = { plano: 'gratuito' };
let instanciaGrafico = null;

const LIMITE_LANCAMENTOS_GRATIS = 20;

document.addEventListener("DOMContentLoaded", async () => {
    document.getElementById("input-data").valueAsDate = new Date();
    alternarCamposFormulario();
    atualizarDisplayMesAno();
    await verificarAutenticacao();
});

async function verificarAutenticacao() {
    // Pega a sessão ativa do usuário logado no Supabase
    const { data: { session } } = await db.auth.getSession();
    
    if (session && session.user) {
        usuarioAtual = session.user;
    } else {
        const { data: { user } } = await db.auth.getUser();
        if (user) {
            usuarioAtual = user;
        }
    }

    if (!usuarioAtual) {
        // Se não houver ninguém logado, redireciona para a página de login
        window.location.href = "/";
        return;
    }

    // Busca o perfil do usuário logado
    const { data: profile } = await db
        .from("profiles")
        .select("*")
        .eq("id", usuarioAtual.id)
        .single();

    if (profile) perfilUsuario = profile;
    
    atualizarInterfacePlano();
    await carregarDadosDoMes();
}

function atualizarInterfacePlano() {
    const badgePlano = document.getElementById("badge-plano");
    const btnUpgrade = document.getElementById("btn-upgrade");

    if (perfilUsuario.plano === "pro") {
        badgePlano.innerText = "Plano PRO 👑";
        badgePlano.className = "bg-amber-900/60 text-amber-300 text-xs px-2.5 py-1 rounded-full font-semibold border border-amber-500/30";
        if (btnUpgrade) btnUpgrade.classList.add("hidden");
    } else {
        badgePlano.innerText = "Plano Gratuito";
        badgePlano.className = "bg-purple-900/60 text-purple-300 text-xs px-2.5 py-1 rounded-full font-semibold border border-purple-500/30";
        if (btnUpgrade) btnUpgrade.classList.remove("hidden");
    }
}

function mudarMes(delta) {
    mesAtual += delta;
    if (mesAtual > 11) {
        mesAtual = 0;
        anoAtual += 1;
    } else if (mesAtual < 0) {
        mesAtual = 11;
        anoAtual -= 1;
    }
    atualizarDisplayMesAno();
    carregarDadosDoMes();
}

function atualizarDisplayMesAno() {
    const dataAux = new Date(anoAtual, mesAtual, 1);
    const nomeMes = dataAux.toLocaleString("pt-BR", { month: "long" });
    document.getElementById("display-mes-ano").innerText = `${nomeMes} de ${anoAtual}`;
}

function alternarCamposFormulario() {
    const tipo = document.getElementById("input-tipo").value;
    const pagamento = document.getElementById("input-pagamento").value;
    const containerParcelas = document.getElementById("container-parcelas");

    if (tipo === "despesa" && pagamento === "Cartão de Crédito") {
        containerParcelas.style.display = "block";
    } else {
        containerParcelas.style.display = "none";
        document.getElementById("input-parcelas").value = "1";
    }
}

async function salvarLancamento() {
    if (!usuarioAtual) {
        alert("Sessão expirada. Faça login novamente.");
        window.location.href = "/";
        return;
    }

    const tipo = document.getElementById("input-tipo").value;
    const descricao = document.getElementById("input-descricao").value;
    const valorTotalStr = document.getElementById("input-valor").value;
    const dataBaseStr = document.getElementById("input-data").value;
    const pagamento = document.getElementById("input-pagamento").value;
    const categoria = document.getElementById("input-categoria").value;

    if (!descricao || !valorTotalStr || !dataBaseStr) {
        alert("Por favor, preencha a descrição, o valor e a data do lançamento.");
        return;
    }

    const valorTotal = parseFloat(valorTotalStr);
    const parcelas = (tipo === "despesa" && pagamento === "Cartão de Crédito") ? parseInt(document.getElementById("input-parcelas").value) : 1;

    if (perfilUsuario.plano !== "pro") {
        const totalLancamentosMes = await contarLancamentosMesAtual();
        if (totalLancamentosMes + parcelas > LIMITE_LANCAMENTOS_GRATIS) {
            abrirModalUpgrade();
            alert(`Limite do plano gratuito atingido (${LIMITE_LANCAMENTOS_GRATIS} lançamentos/mês).`);
            return;
        }
    }

    const valorParcela = valorTotal / parcelas;
    const novosRegistros = [];

    for (let i = 0; i < parcelas; i++) {
        let dataParcela = new Date(dataBaseStr + "T00:00:00");
        dataParcela.setMonth(dataParcela.getMonth() + i);

        novosRegistros.push({
            user_id: usuarioAtual.id, // Usa o ID exclusivo do utilizador logado
            tipo: tipo,
            descricao: parcelas > 1 ? `${descricao} (${i + 1}/${parcelas})` : descricao,
            valor: parseFloat(valorParcela.toFixed(2)),
            data: dataParcela.toISOString().split("T")[0],
            forma_pagamento: pagamento,
            categoria: categoria
        });
    }

    const { error } = await db.from("gastos").insert(novosRegistros);

    if (error) {
        alert("Erro ao salvar no banco: " + error.message);
    } else {
        document.getElementById("input-descricao").value = "";
        document.getElementById("input-valor").value = "";
        document.getElementById("input-data").valueAsDate = new Date();
        alternarCamposFormulario();
        await carregarDadosDoMes();
    }
}

async function contarLancamentosMesAtual() {
    if (!usuarioAtual) return 0;
    const inicioMes = new Date(anoAtual, mesAtual, 1).toISOString().split("T")[0];
    const fimMes = new Date(anoAtual, mesAtual + 1, 0).toISOString().split("T")[0];

    const { count } = await db
        .from("gastos")
        .select("*", { count: "exact", head: true })
        .eq("user_id", usuarioAtual.id)
        .gte("data", inicioMes)
        .lte("data", fimMes);

    return count || 0;
}

async function carregarDadosDoMes() {
    if (!usuarioAtual) return;

    const inicioMes = new Date(anoAtual, mesAtual, 1).toISOString().split("T")[0];
    const fimMes = new Date(anoAtual, mesAtual + 1, 0).toISOString().split("T")[0];

    const { data: lancamentos, error } = await db
        .from("gastos")
        .select("*")
        .eq("user_id", usuarioAtual.id)
        .gte("data", inicioMes)
        .lte("data", fimMes)
        .order("data", { ascending: false });

    if (error) {
        console.error("Erro ao buscar lançamentos:", error);
        return;
    }

    const totalMes = lancamentos ? lancamentos.length : 0;
    const statusLimite = document.getElementById("status-limite-mensal");
    if (statusLimite) {
        statusLimite.innerText = perfilUsuario.plano === "pro" 
            ? `Lançamentos no mês: ${totalMes} (Ilimitado)`
            : `Lançamentos no mês: ${totalMes}/${LIMITE_LANCAMENTOS_GRATIS}`;
    }

    let totalReceitas = 0;
    let totalDespesas = 0;
    const categoriasGastos = {};

    const tabela = document.getElementById("tabela-lancamentos");
    tabela.innerHTML = "";

    if (!lancamentos || lancamentos.length === 0) {
        tabela.innerHTML = `<tr><td colspan="5" class="p-4 text-center text-slate-500">Nenhum lançamento cadastrado neste mês.</td></tr>`;
    } else {
        lancamentos.forEach((item) => {
            if (item.tipo === "receita") {
                totalReceitas += item.valor;
            } else {
                totalDespesas += item.valor;
                const cat = item.categoria || "Outros";
                categoriasGastos[cat] = (categoriasGastos[cat] || 0) + item.valor;
            }

            const dataFormatada = new Date(item.data + "T00:00:00").toLocaleDateString("pt-BR");
            const ehReceita = item.tipo === "receita";

            const tr = document.createElement("tr");
            tr.className = "hover:bg-slate-700/30 transition";
            tr.innerHTML = `
                <td class="p-2.5 text-slate-400 text-xs">${dataFormatada}</td>
                <td class="p-2.5 font-medium text-white">${item.descricao}</td>
                <td class="p-2.5 text-xs text-slate-300">${item.forma_pagamento || 'Pix'}</td>
                <td class="p-2.5 text-right font-bold ${ehReceita ? 'text-emerald-400' : 'text-rose-400'}">
                    ${ehReceita ? '+' : '-'} R$ ${item.valor.toFixed(2).replace('.', ',')}
                </td>
                <td class="p-2.5 text-center">
                    <button type="button" onclick="deletarLancamento('${item.id}')" class="text-slate-500 hover:text-rose-400 transition cursor-pointer" title="Excluir">
                        <i class="fa-solid fa-trash-can"></i>
                    </button>
                </td>
            `;
            tabela.appendChild(tr);
        });
    }

    const saldo = totalReceitas - totalDespesas;
    document.getElementById("total-receitas").innerText = `R$ ${totalReceitas.toFixed(2).replace('.', ',')}`;
    document.getElementById("total-despesas").innerText = `R$ ${totalDespesas.toFixed(2).replace('.', ',')}`;
    document.getElementById("total-saldo").innerText = `R$ ${saldo.toFixed(2).replace('.', ',')}`;

    atualizarGraficoCategorias(categoriasGastos);
}

function atualizarGraficoCategorias(dadosCategorias) {
    const canvas = document.getElementById("grafico-categorias");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const labels = Object.keys(dadosCategorias);
    const valores = Object.values(dadosCategorias);

    if (instanciaGrafico) {
        instanciaGrafico.destroy();
    }

    if (labels.length === 0) {
        instanciaGrafico = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Sem despesas'],
                datasets: [{ data: [1], backgroundColor: ['#334155'] }]
            },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
        });
        return;
    }

    instanciaGrafico = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: valores,
                backgroundColor: ['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899', '#64748b']
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom', labels: { color: '#94a3b8', font: { size: 10 } } }
            }
        }
    });
}

async function deletarLancamento(id) {
    if (!confirm("Tem certeza que deseja excluir este lançamento?")) return;
    const { error } = await db.from("gastos").delete().eq("id", id);
    if (error) alert("Erro ao excluir: " + error.message);
    else await carregarDadosDoMes();
}

function abrirModalUpgrade() {
    document.getElementById("modal-upgrade").classList.remove("hidden");
}

function fecharModalUpgrade() {
    document.getElementById("modal-upgrade").classList.add("hidden");
}

function solicitarUpgrade() {
    alert("Redirecionando para a página de pagamento...");
}

async function fazerLogout() {
    try {
        await db.auth.signOut();
    } catch (e) {}
    localStorage.clear();
    window.location.href = "/";
}