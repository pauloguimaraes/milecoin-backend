/*
 * -----------------
 * -- Importações --
 * -----------------
 */


import * as _ from 'lodash';
import { Transacao, CabecalhoTran, CorposNaoProcessados, valida_transacao } from './transaction';



/*
 * ---------------
 * -- Variáveis --
 * ---------------
 */


let pool_transacoes: Transacao[] = [];



/*
 * -------------
 * -- Funções --
 * -------------
 */


/**
 * Recupera o pool de transações
 */
const get_pool_transacoes = () => {
    return _.cloneDeep(pool_transacoes);
};


/**
 * Adiciona uma transação ao pool.
 * @param tx Transação em questão
 * @param corpos_nao_processados Corpos não processados
 */
const add_transacao_no_pool = (tx: Transacao, corpos_nao_processados: CorposNaoProcessados[]) => {

    // Se a transação não é válida ou o cabeçalho não é válido
    if (!valida_transacao(tx, corpos_nao_processados) || !is_cabecalho_no_pool_valido(tx, pool_transacoes))
        throw Error('Tentando adicionar transação inválida');

    pool_transacoes.push(tx);
};


/**
 * Verifica se o cabeçalho está na lista de corpos não processados.
 * @param cabecalho Cabeçalho
 * @param corpos_nao_processados Corpos não processados
 */
const has_cabecalho = (cabecalho: CabecalhoTran, corpos_nao_processados: CorposNaoProcessados[]): boolean => {
    const foundTxIn = corpos_nao_processados.find((uTxO: CorposNaoProcessados) => {
        return uTxO.id_saida === cabecalho.id_saida && uTxO.indice_saida === cabecalho.indice_saida;
    });

    return foundTxIn !== undefined;
};


/**
 * Atualiza o pool com os corpos não processados.
 * @param corpos_nao_processados Lista de corpos não processados
 */
const atualiza_pool = (corpos_nao_processados: CorposNaoProcessados[]) => {
    const transacoes_invalidas = [];
    for (const tx of pool_transacoes) {
        for (const cabecalho of tx.cabecalhos) {
            if (!has_cabecalho(cabecalho, corpos_nao_processados)) {
                transacoes_invalidas.push(tx);
                break;
            }
        }
    }

    // Remove as transações inválidas
    if (transacoes_invalidas.length > 0)
        pool_transacoes = _.without(pool_transacoes, ...transacoes_invalidas);
};


/**
 * Recupera os cabeçalhos presentes no pool de transações.
 * @param pool Pool de transações
 */
const get_cabecalhos_no_pool = (pool: Transacao[]): CabecalhoTran[] => {
    return _(pool)
        .map((tx) => {
            return tx.cabecalhos;
        }).flatten().value();
};


/**
 * Verifica se o cabeçalho da transação é válido no pool.
 * @param tx Transação
 * @param pool Pool de transações
 */
const is_cabecalho_no_pool_valido = (tx: Transacao, pool: Transacao[]): boolean => {
    const cabec_pool: CabecalhoTran[] = get_cabecalhos_no_pool(pool);

    const tem_cabecalho = (cabecalhos: CabecalhoTran[], cabecalho: CabecalhoTran) => {
        return _.find(cabec_pool, ((txPoolIn) => {
            return cabecalho.indice_saida === txPoolIn.indice_saida && cabecalho.id_saida === txPoolIn.id_saida;
        }));
    };

    for (const cabecalho of tx.cabecalhos) {
        if (tem_cabecalho(cabec_pool, cabecalho))
            return false;
    }
    return true;
};



/*
 * -----------------
 * -- Exportações --
 * -----------------
 */


export {add_transacao_no_pool, get_pool_transacoes, atualiza_pool};