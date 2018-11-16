/*
 * -----------------
 * -- Importações --
 * -----------------
 */


import * as CryptoJS from 'crypto-js';
import * as ecdsa from 'elliptic';
import * as _ from 'lodash';



/*
 * ---------------
 * -- Variáveis --
 * ---------------
 */


const ec = new ecdsa.ec('secp256k1');
const COINBASE_AMOUNT: number = 50;



/*
 * ---------------------------
 * -- Estruturas auxiliares --
 * ---------------------------
 */

/**
 * Estrutura de corpos não processados
 */
class CorposNaoProcessados {
    public readonly id_saida: string;
    public readonly indice_saida: number;
    public readonly endereco: string;
    public readonly valor: number;

    constructor(id_saida: string, indice_saida: number, endereco: string, valor: number) {
        this.id_saida = id_saida;
        this.indice_saida = indice_saida;
        this.endereco = endereco;
        this.valor = valor;
    }
}


/**
 * Estrutura do cabeçalho da transação
 */
class CabecalhoTran {
    public id_saida: string;
    public indice_saida: number;
    public assinatura: string;
}


/**
 * Estrutura do corpo da transação
 */
class CorpoTran {
    public endereco: string;
    public valor: number;

    constructor(endereco: string, valor: number) {
        this.endereco = endereco;
        this.valor = valor;
    }
}


/**
 * Estrutura de transação
 */
class Transacao {
    public id: string;

    public cabecalhos: CabecalhoTran[];
    public corpos: CorpoTran[];
}



/*
 * -------------
 * -- Funções --
 * -------------
 */


/**
 * Recupera a identificação da transação.
 * @param transacao Transação cuja identificação será gerada
 */
const get_id_transacao = (transacao: Transacao): string => {
    const conteudo_cabecalho: string = transacao.cabecalhos
        .map((cabecalho: CabecalhoTran) => {
            return cabecalho.id_saida + cabecalho.indice_saida;
        })
        .reduce((a, b) => a + b, '');

    const conteudo_tranOut: string = transacao.corpos
        .map((corpo: CorpoTran) => {
            return corpo.endereco + corpo.valor;
        })
        .reduce((a, b) => a + b, '');

    return CryptoJS.SHA256(conteudo_cabecalho + conteudo_tranOut).toString();
};


/**
 * Valida a transação e verifica se ela já não entrou no pool.
 * @param transacao Transação que será validada
 * @param lista_corpos_nao_processados Lista de transações não processadas
 */
const valida_transacao = (transacao: Transacao, lista_corpos_nao_processados: CorposNaoProcessados[]): boolean => {
    
    // Verifica se a estrutura da transação está correta
    if (!is_estrutura_transacao_valida(transacao))
        return false;

    // Verifica se o ID da transação bate com o informado
    if (get_id_transacao(transacao) !== transacao.id)
        return false;
    
    
    // Valida o cabeçalho
    const has_cabecalho_valido: boolean = transacao.cabecalhos
        .map((txIn) => valida_cabecalho(txIn, transacao, lista_corpos_nao_processados))
        .reduce((a, b) => a && b, true);

    if (!has_cabecalho_valido)
        return false;

    
    // Valida os valores
    const total_cabecalho: number = transacao.cabecalhos
        .map((txIn) => {
            return get_valores_cabecalho(txIn, lista_corpos_nao_processados);
        })
        .reduce((a, b) => (a + b), 0);

    const total_corpo: number = transacao.corpos
        .map((txOut) => txOut.valor)
        .reduce((a, b) => (a + b), 0);

    if (total_corpo !== total_cabecalho)
        return false;
    
    
    // Se chegou aqui a transação é válida
    return true;
};


/**
 * Valida um bloco de transações.
 * @param lista_de_transacoes Transações
 * @param lista_corpos_nao_processados Transações não processadas
 * @param indice_bloco Índice do bloco
 */
const valida_bloco_transacoes = (lista_de_transacoes: Transacao[], lista_corpos_nao_processados: CorposNaoProcessados[], indice_bloco: number): boolean => {
    const tran_coinbase = lista_de_transacoes[0];
    if (!valida_transacao_coinbase(tran_coinbase, indice_bloco))
        return false;


    // Verifica cabeçalhos duplicados
    const cabecalhos: CabecalhoTran[] = _(lista_de_transacoes)
        .map((transacao) => {
            return transacao.cabecalhos;
        }).flatten().value();

    if (tem_duplicatas(cabecalhos))
        return false;


    // Verifica todas as transações, exceto a coinbase
    const transacoes_regulares: Transacao[] = lista_de_transacoes.slice(1);
    return transacoes_regulares.map((transacao) => {
        return valida_transacao(transacao, lista_corpos_nao_processados);
    })
    .reduce((a, b) => (a && b), true);
};


/**
 * Verifica se existem cabeçalhos duplicados.
 * @param cabecalhos Cabeçalhos
 */
const tem_duplicatas = (cabecalhos: CabecalhoTran[]): boolean => {
    const agrupamento_de_cabecalho = _.countBy(cabecalhos, (cabecalho: CabecalhoTran) => {
        return cabecalho.id_saida + cabecalho.indice_saida;
    });

    return _(agrupamento_de_cabecalho)
        .map((quantidade, chave) => {
            return quantidade > 1;
        })
        .includes(true);
};


/**
 * Valida a transação coinbase.
 * @param transacao Transação coinbase
 * @param indice_bloco Índice do bloco
 */
const valida_transacao_coinbase = (transacao: Transacao, indice_bloco: number): boolean => {
    // Se não passaram transação no parâmetro
    if (transacao == null)
        return false;
    
    // Se o ID da transação não bate
    if (get_id_transacao(transacao) !== transacao.id)
        return false;
    
    // Se não tem cabeçalho
    if (transacao.cabecalhos.length !== 1)
        return false;

    // Se o índice do cabeçalho não bate com o índice do bloco
    if (transacao.cabecalhos[0].indice_saida !== indice_bloco)
        return false;

    // Se não tem corpo
    if (transacao.corpos.length !== 1) 
        return false;

    // Se o valor não é o padrão da coinbase
    if (transacao.corpos[0].valor !== COINBASE_AMOUNT)
        return false;
    
    
    // Se chegou aqui é válida
    return true;
};


/**
 * Valida cabeçalho de uma transação.
 * @param txIn Cabeçalho
 * @param transacao Transação
 * @param lista_corpos_nao_processados Lista de transações não processadas
 */
const valida_cabecalho = (txIn: CabecalhoTran, transacao: Transacao, lista_corpos_nao_processados: CorposNaoProcessados[]): boolean => {
    // Verifica os corpos presentes na lista
    const corpos_referenciados: CorposNaoProcessados =
        lista_corpos_nao_processados.find((corpo) => {
            return corpo.id_saida === txIn.id_saida && corpo.indice_saida === txIn.indice_saida;
        });

    if (corpos_referenciados == null)
        return false;
    
    
    // Valida a assinatura da transação
    const endereco = corpos_referenciados.endereco;
    const chave = ec.keyFromPublic(endereco, 'hex');
    const is_assinatura_valida: boolean = chave.verify(transacao.id, txIn.assinatura);

    if (!is_assinatura_valida)
        return false;

    
    // Se chegou aqui é válido
    return true;
};


/**
 * Recupera o valor de uma transação com determinado cabeçalho.
 * @param txIn Cabeçalho
 * @param lista_corpos_nao_processados Lista de corpos não processados
 */
const get_valores_cabecalho = (txIn: CabecalhoTran, lista_corpos_nao_processados: CorposNaoProcessados[]): number => {
    return get_corpos_nao_registrados(txIn.id_saida, txIn.indice_saida, lista_corpos_nao_processados).valor;
};


/**
 * Recupera os corpos não processados de determinada transação.
 * @param transactionId ID da transação em questão
 * @param index Índice da transação
 * @param lista_corpos_nao_processados Lista de corpos não processados
 */
const get_corpos_nao_registrados = (transactionId: string, index: number, lista_corpos_nao_processados: CorposNaoProcessados[]): CorposNaoProcessados => {
    return lista_corpos_nao_processados.find((corpo) => {
        return corpo.id_saida === transactionId && corpo.indice_saida === index
    });
};


/**
 * Recupera transação coinbase.
 * @param endereco Endereço da transação
 * @param indice_bloco Índice do bloco da transação
 */
const get_transacao_coinbase = (endereco: string, indice_bloco: number): Transacao => {
    const t = new Transacao();
    const cabec: CabecalhoTran = new CabecalhoTran();
    cabec.assinatura = '';
    cabec.id_saida = '';
    cabec.indice_saida = indice_bloco;

    t.cabecalhos = [cabec];
    t.corpos = [new CorpoTran(endereco, COINBASE_AMOUNT)];
    t.id = get_id_transacao(t);
    return t;
};


/**
 * Assina o cabeçalho da transação.
 * @param transacao Transação
 * @param indice_cabecalho Índice do cabeçalho
 * @param chave_privada Chave privada para assinatura
 * @param lista_corpos_nao_processados Lista de corpos ainda não processados
 */
const assina_cabecalho = (transacao: Transacao, indice_cabecalho: number, chave_privada: string, lista_corpos_nao_processados: CorposNaoProcessados[]): string => {

    const cabec: CabecalhoTran = transacao.cabecalhos[indice_cabecalho];
    const dados_para_assinar = transacao.id;
    const corpos_nao_referenciados: CorposNaoProcessados = get_corpos_nao_registrados(cabec.id_saida, cabec.indice_saida, lista_corpos_nao_processados);

    if (corpos_nao_referenciados == null)
        throw Error();

    
    // Verifica se a assinatura do cabeçalho bate com a chave pública
    const endereco_referenciado = corpos_nao_referenciados.endereco;
    if (get_chave_publica(chave_privada) !== endereco_referenciado)
        throw Error();

    const chave = ec.keyFromPrivate(chave_privada, 'hex');
    const assinatura: string = para_hexadecimal(chave.sign(dados_para_assinar).toDER());


    // Retorna a assinatura
    return assinatura;
};


/**
 * Atualiza listagem de transações não processadas.
 * @param lista_de_transacoes Lista de transações a serem processadas
 * @param lista_corpos_nao_processados Lista de transações não processadas
 */
const atualiza_corpos_nao_processados = (lista_de_transacoes: Transacao[], lista_corpos_nao_processados: CorposNaoProcessados[]): CorposNaoProcessados[] => {
    // Novas transações não processadas
    const novas_transacoes_naoprocessadas: CorposNaoProcessados[] = lista_de_transacoes
        .map((t) => {
            return t.corpos.map((corpo, index) => new CorposNaoProcessados(t.id, index, corpo.endereco, corpo.valor));
        })
        .reduce((a, b) => a.concat(b), []);

    // Corpos já processados
    const corpos_processados: CorposNaoProcessados[] = lista_de_transacoes
        .map((t) => {
            return t.cabecalhos;
        })
        .reduce((a, b) => a.concat(b), [])
        .map((cabecalho) => {
            return new CorposNaoProcessados(cabecalho.id_saida, cabecalho.indice_saida, '', 0)
        });

    // Corpos resultantes (Não processados - Processados)
    const corpos_resultantes = lista_corpos_nao_processados
        .filter(((corpo) => !get_corpos_nao_registrados(corpo.id_saida, corpo.indice_saida, corpos_processados)))
        .concat(novas_transacoes_naoprocessadas);
    
    
    return corpos_resultantes;
};


/**
 * Processa transações presentes no pool.
 * @param lista_de_transacoes Lista de transações já processadas
 * @param lista_corpos_nao_processados Lista de corpos ainda não processados
 * @param indice_bloco Índice do bloco
 */
const processa_transacoes = (lista_de_transacoes: Transacao[], lista_corpos_nao_processados: CorposNaoProcessados[], indice_bloco: number) => {
    // Se o bloco não válido.
    if (!valida_bloco_transacoes(lista_de_transacoes, lista_corpos_nao_processados, indice_bloco))
        return null;

    // Atualiza lista de transações não processadas
    return atualiza_corpos_nao_processados(lista_de_transacoes, lista_corpos_nao_processados);
};


/**
 * Converte um array de bytes para uma string hexadecimal.
 * @param byteArray Array de bytes em questão
 */
const para_hexadecimal = (byteArray): string => {
    return Array.from(byteArray, (byte: any) => {
        return ('0' + (byte & 0xFF).toString(16)).slice(-2);
    }).join('');
};


/**
 * Gera uma chave pública a partir de uma privada.
 * @param uma_chave_privada Chave privada que gerará a chave pública
 */
const get_chave_publica = (uma_chave_privada: string): string => {
    return ec.keyFromPrivate(uma_chave_privada, 'hex').getPublic().encode('hex');
};


/**
 * Valida a estrutura de um cabeçalho de transação
 * @param cabecalho Cabeçalho da transação em questão
 */
const isValidTxInStructure = (cabecalho: CabecalhoTran): boolean => {
    // Se não chegou no parâmetro
    if (cabecalho == null)
        return false;
    // Tipo da assinatura
    else if (typeof cabecalho.assinatura !== 'string')
        return false;
    // Tipo do ID
    else if (typeof cabecalho.id_saida !== 'string')
        return false;
    // Tipo do índice
    else if (typeof  cabecalho.indice_saida !== 'number')
        return false;
    else
        return true;
};


/**
 * Valida a estrutura de um corpo de transação.
 * @param corpo Corpo da transação em questão
 */
const is_estrutura_corpo_valido = (corpo: CorpoTran): boolean => {
    // Se não chegou no parâmetro
    if (corpo == null)
        return false;
    // Tipo do endereço
    else if (typeof corpo.endereco !== 'string')
        return false;
    // Verifica o endereço
    else if (!is_endereco_valido(corpo.endereco))
        return false;
    // Tipo do valor
    else if (typeof corpo.valor !== 'number')
        return false;
    else
        return true;
};


/**
 * Valida a estrutura do objeto de transação.
 * @param transacao Transação em questão
 */
const is_estrutura_transacao_valida = (transacao: Transacao) => {

    // Tipo do ID
    if (typeof transacao.id !== 'string')
        return false;

    // Tipo do cabeçalho
    if (!(transacao.cabecalhos instanceof Array))
        return false;
    
    // Valida estrutura do cabeçalho
    if (!transacao.cabecalhos.map(isValidTxInStructure).reduce((a, b) => (a && b), true))
        return false;

    // Tipo do corpo
    if (!(transacao.corpos instanceof Array))
        return false;
    
    // Valida estrutura do corpo
    if (!transacao.corpos
            .map(is_estrutura_corpo_valido)
            .reduce((a, b) => (a && b), true))
        return false;
    
    
    // Se chegou aqui é uma estrutura válida
    return true;
};


/**
 * Verifica se o endereço é válido.
 * @param endereco Endereço em questão
 */
const is_endereco_valido = (endereco: string): boolean => {
    // Valida o tamanho
    if (endereco.length !== 130) 
        return false;
    
    // Valida os caracteres
    else if (endereco.match('^[a-fA-F0-9]+$') === null)
        return false;
    
    // Se inicia com 04
    else if (!endereco.startsWith('04'))
        return false;
    
    // Se chegou aqui é válido
    return true;
};



/*
 * -----------------
 * -- Exportações --
 * -----------------
 */


export { processa_transacoes, assina_cabecalho, get_id_transacao, is_endereco_valido, valida_transacao, CorposNaoProcessados, CabecalhoTran, CorpoTran, get_transacao_coinbase, get_chave_publica, tem_duplicatas, Transacao };