const PNTP_WEIGHTS = {
    "Informações Prioritárias": 2,
    "Informações Institucionais": 2,
    "Receita": 4,
    "Despesa": 4,
    "Convênios e Transferências": 1,
    "Recursos Humanos": 3,
    "Diárias": 1,
    "Licitações": 3,
    "Contratos": 3,
    "Obras": 2,
    "Planejamento e Prestação de Contas": 4,
    "SIC": 2,
    "Acessibilidade": 1,
    "Ouvidoria": 1,
    "LGPD e Governo Digital": 1
};

// Amostra representativa da Matriz de Critérios do PNTP 2026
// Na aplicação final, pode-se expandir para os 181 critérios da cartilha.
const CRITERIA = [
    { id: "1.1", dimension: "Informações Prioritárias", type: "Essencial", text: "Possui sítio oficial próprio na internet?" },
    { id: "1.2", dimension: "Informações Prioritárias", type: "Essencial", text: "Possui portal da transparência próprio ou compartilhado na internet?" },
    { id: "1.4", dimension: "Informações Prioritárias", type: "Obrigatório", text: "O site e o portal contêm ferramenta de pesquisa de conteúdo?" },
    
    { id: "2.1", dimension: "Informações Institucionais", type: "Obrigatório", text: "Divulga a sua estrutura organizacional e a norma que a institui/altera?" },
    { id: "2.8", dimension: "Informações Institucionais", type: "Recomendado", text: "Participa em redes sociais e apresenta link de acesso ao perfil?" },
    
    { id: "3.1", dimension: "Receita", type: "Essencial", text: "Divulga as receitas do Poder ou órgão, evidenciando sua previsão e realização?" },
    { id: "3.3", dimension: "Receita", type: "Obrigatório", text: "Divulga a lista dos inscritos em dívida ativa?" },

    { id: "4.1", dimension: "Despesa", type: "Essencial", text: "Divulga o total das despesas empenhadas, liquidadas e pagas?" },
    { id: "4.2", dimension: "Despesa", type: "Essencial", text: "Divulga as despesas por classificação orçamentária?" },
    { id: "4.4", dimension: "Despesa", type: "Obrigatório", text: "Publica relação das despesas com aquisições de bens efetuadas pela instituição?" },

    { id: "6.1", dimension: "Recursos Humanos", type: "Obrigatório", text: "Divulga a relação nominal dos servidores, seus cargos/funções, lotações e horários?" },
    { id: "6.4", dimension: "Recursos Humanos", type: "Recomendado", text: "Divulga a lista de seus estagiários?" },

    { id: "8.1", dimension: "Licitações", type: "Obrigatório", text: "Divulga a relação das licitações em ordem sequencial com editais?" },
    
    { id: "9.1", dimension: "Contratos", type: "Obrigatório", text: "Divulga a relação dos contratos celebrados em ordem sequencial?" },

    { id: "10.1", dimension: "Obras", type: "Recomendado", text: "Divulga informações sobre as obras contendo o objeto, situação e percentual?" },

    { id: "11.1", dimension: "Planejamento e Prestação de Contas", type: "Obrigatório", text: "Publica a Prestação de Contas do Ano Anterior (Balanço Geral)?" },
    { id: "11.2", dimension: "Planejamento e Prestação de Contas", type: "Obrigatório", text: "Divulga o Relatório de Gestão ou Atividades?" },
    
    { id: "12.1", dimension: "SIC", type: "Obrigatório", text: "Existe o e-SIC no site e indica a unidade/setor responsável?" },
    
    { id: "13.1", dimension: "Acessibilidade", type: "Obrigatório", text: "O site e portal contêm símbolo de acessibilidade em destaque e atalhos em libras?" },
    
    { id: "14.2", dimension: "Ouvidoria", type: "Obrigatório", text: "Há canal eletrônico de acesso/interação com a ouvidoria?" },

    { id: "15.1", dimension: "LGPD e Governo Digital", type: "Obrigatório", text: "Identifica o encarregado/responsável pelo tratamento de dados pessoais?" },
    { id: "15.3", dimension: "LGPD e Governo Digital", type: "Obrigatório", text: "Possibilita a demanda e o acesso a serviços públicos por meio digital?" }
];
