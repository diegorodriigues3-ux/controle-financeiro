// CONFIGURAÇÃO DO SUPABASE
const SUPABASE_URL = "https://ugyrxgpffvrmzomldibk.supabase.co"; // Substitua com a sua URL se diferente
const SUPABASE_KEY = "SUA_CHAVE_ANON_AQUI"; // Cole a sua anon key do Supabase aqui

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ESTADO DA APLICAÇÃO
let usuarioAtual = null;
let mesAtual = new Date().getMonth();
let anoAtual = new Date().getFullYear();
let perfilUsuario = { plano: 'gratuito' };

// CONFIGURAÇÃO DE LIMITES FREEMIUM
const LIMITE_LANCAMENTOS_GRATIS = 20;

// INICIALIZAÇÃO
document.addEventListener("DOMContentLoaded", async () => {
    // Definir data padrão de hoje no formulário
    document.getElementById("input-data").valueAsDate = new Date();
    
    await verificarAutenticacao();
    atualizarDisplayMesAno();
    await carregarDadosDoMes();
});

// AUTENTICAÇÃO E CHECAGEM DE USUÁRIO
async function verificarAutenticacao() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        window.location.href = "/"; // Redireciona para tela de login se não autenticado
        return;
    }
    usuarioAtual = user;

    // Buscar plano do usuário na tabela de perfis
    const { data: profile } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();

    if (profile) {
        perfilUsuario = profile;
    }

    atualizarInterfacePlano();
}

function atualizarInterfacePlano() {
    const badgePlano = document.getElementById("badge-plano");
    const btnUpgrade = document.getElementById("btn-upgrade");

    if (perfilUsuario.plano === "pro") {
        badgePlano.innerText = "Plano PRO 👑";
        badgePlano.className = "bg-amber-900/60 text-amber-300 text-xs px-2.5 py-1 rounded-full font-semibold border border-amber-500/30";
        btnUpgrade.classList.add("hidden");
    } else {
        badgePlano.innerText = "Plano Gratuito";
        badgePlano.className = "bg-purple-900/60 text-purple-300 text-xs px-2.5 py-1 rounded-full font-semibold border border-purple-500/30";
        btnUpgrade.classList.remove("hidden");
    }
}

// CONTROLE DE MESES
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

// OCULTAR/EXIBIR PARCELAS SE FOR RECEITA
function alternarCampoParcelas() {
    const tipo = document.getElementById("input-tipo").value;
    const container = document.getElementById("container-parcelas");
    if (tipo === "receita") {
        container.style.display = "none";
        document.getElementById("input-parcelas").value = "1";
    } else {
        container.style.display = "block";
    }
}

// SALVAR LANÇAMENTO E TRATAR PARCELAMENTO
async function salvarLancamento(event) {
    event.preventDefault();
    if (!usuarioAtual) return;

    const tipo = document.getElementById("input-tipo").value;
    const descricao = document.getElementById("input-descricao").value;
    const valorTotal = parseFloat(document.getElementById("input-valor").value);
    const dataBaseStr = document.getElementById("input-data").value;
    const parcelas = parseInt(document.getElementById("input-parcelas").value);

    // Validação do Limite Freemium (Plano Gratuito)
    if (perfilUsuario.plano !== "pro") {
        const totalLancamentosMes = await contarLancamentosMesAtual();
        if (totalLancamentosMes + parcelas > LIMITE_LANCAMENTOS_GRATIS) {
            abrirModalUpgrade();
            alert(`Você atingiu o limite de ${LIMITE_LANCAMENTOS_GRATIS} lançamentos do plano gratuito neste mês! Faça o upgrade para o PRO para continuar.`);
            return;
        }
    }

    const valorParcela = valorTotal / parcelas;
    const novosRegistros = [];

    // Gerar as parcelas mês a mês automaticamente
    for (let i = 0; i < parcelas; i++) {
        let dataParcela = new Date(dataBaseStr + "T00:00:00");
        dataParcela.setMonth(dataParcela.getMonth() + i);

        novosRegistros.push({
            user_id: usuarioAtual.id,
            tipo: tipo,
            descricao: parcelas > 1 ? `${descricao} (${i + 1}/${parcelas})` : descricao,
            valor: parseFloat(valorParcela.toFixed(2)),
            data: dataParcela.toISOString().split("T")[0]
        });
    }

    const { error } = await supabase.from("gastos").insert(novosRegistros);

    if (error) {
        alert("Erro ao salvar lançamento: " + error.message);
    } else {
        document.getElementById("form-lancamento").reset();
        document.getElementById("input-data").valueAsDate = new Date();
        alternarCampoParcelas();
        await carregarDadosDoMes();
    }
}

// CONTAGEM DE LANÇAMENTOS DO MÊS PARA O FREEMIUM
async function contarLancamentosMesAtual() {
    const inicioMes = new Date(anoAtual, mesAtual, 1).toISOString().split("T")[0];
    const fimMes = new Date(anoAtual, mesAtual + 1, 0).toISOString().split("T")[0];

    const { count } = await supabase
        .from("gastos")
        .select("*", { count: "exact", head: true })
        .eq("user_id", usuarioAtual.id)
        .gte("data", inicioMes)
        .lte("data", fimMes);

    return count || 0;
}

// CARREGAR E EXIBIR OS DADOS DO MÊS SELECIONADO
async function carregarDadosDoMes() {
    if (!usuarioAtual) return;

    const inicioMes = new Date(anoAtual, mesAtual, 1).toISOString().split("T")[0];
    const fimMes = new Date(anoAtual, mesAtual + 1, 0).toISOString().split("T")[0];

    const { data: lancamentos, error } = await supabase
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

    // Atualizar Contagem Freemium no Painel
    const totalMes = lancamentos ? lancamentos.length : 0;
    const statusLimite = document.getElementById("status-limite-mensal");
    if (perfilUsuario.plano === "pro") {
        statusLimite.innerText = `Lançamentos no mês: ${totalMes} (Ilimitado)`;
    } else {
        statusLimite.innerText = `Lançamentos no mês: ${totalMes}/${LIMITE_LANCAMENTOS_GRATIS}`;
    }

    // Calcular Totais
    let totalReceitas = 0;
    let totalDespesas = 0;

    const tabela = document.getElementById("tabela-lancamentos");
    tabela.innerHTML = "";

    if (!lancamentos || lancamentos.length === 0) {
        tabela.innerHTML = `<tr><td colspan="5" class="p-4 text-center text-slate-500">Nenhum lançamento cadastrado para este mês.</td></tr>`;
    } else {
        lancamentos.forEach((item) => {
            if (item.tipo === "receita") totalReceitas += item.valor;
            else totalDespesas += item.valor;

            const dataFormatada = new Date(item.data + "T00:00:00").toLocaleDateString("pt-BR");
            const ehReceita = item.tipo === "receita";

            const tr = document.createElement("tr");
            tr.className = "hover:bg-slate-700/30 transition";
            tr.innerHTML = `
                <td class="p-3 text-slate-400">${dataFormatada}</td>
                <td class="p-3 font-medium text-white">${item.descricao}</td>
                <td class="p-3">
                    <span class="text-xs px-2 py-0.5 rounded-full ${ehReceita ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'bg-rose-950 text-rose-400 border border-rose-800'}">
                        ${ehReceita ? 'Receita' : 'Despesa'}
                    </span>
                </td>
                <td class="p-3 text-right font-bold ${ehReceita ? 'text-emerald-400' : 'text-rose-400'}">
                    ${ehReceita ? '+' : '-'} R$ ${item.valor.toFixed(2).replace('.', ',')}
                </td>
                <td class="p-3 text-center">
                    <button onclick="deletarLancamento('${item.id}')" class="text-slate-500 hover:text-rose-400 transition p-1" title="Excluir">
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
}

// DELETAR LANÇAMENTO
async function deletarLancamento(id) {
    if (!confirm("Tem certeza que deseja excluir este lançamento?")) return;

    const { error } = await supabase.from("gastos").delete().eq("id", id);
    if (error) {
        alert("Erro ao excluir lançamento: " + error.message);
    } else {
        await carregarDadosDoMes();
    }
}

// MODAL DE UPGRADE E AUTENTICAÇÃO
function abrirModalUpgrade() {
    document.getElementById("modal-upgrade").classList.remove("hidden");
}

function fecharModalUpgrade() {
    document.getElementById("modal-upgrade").classList.add("hidden");
}

function solicitarUpgrade() {
    alert("Redirecionando para a página de pagamento seguro (Mercado Pago / Stripe)...");
}

async function fazerLogout() {
    await supabase.auth.signOut();
    window.location.href = "/";
}