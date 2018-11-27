/*
 * -----------------
 * -- Importações --
 * -----------------
 */


import * as CryptoJS from 'crypto-js';
import * as _ from 'lodash';
import { broadcast_atualizacao, broadcast_pool } from './p2p';
import { get_transacao_coinbase, is_endereco_valido, processa_transacoes, Transacao, CorposNaoProcessados, get_chave_publica } from './transaction';
import { add_transacao_no_pool, get_pool_transacoes, atualiza_pool } from './transactionPool';
import { hexadecimal_para_binario } from './util';
import { cria_transacao, encontra_transacoes_nao_processadas, get_saldo, get_chave_privada_carteira, get_chave_publica_carteira } from './wallet';



/*
 * ----------------
 * -- Estruturas --
 * ----------------
 */


 /**
  * Estrutura de bloco
  */
class Bloco {
    public indice: number;
    public hash: string;
    public hash_anterior: string;
    public timestamp: number;
    public dados: Transacao[];
    public dificuldade: number;
    public nonce: number;

    constructor(indice: number, hash: string, hash_anterior: string,
                timestamp: number, dados: Transacao[], dificuldade: number, nonce: number) {
        this.indice = indice;
        this.hash_anterior = hash_anterior;
        this.timestamp = timestamp;
        this.dados = dados;
        this.hash = hash;
        this.dificuldade = dificuldade;
        this.nonce = nonce;
    }
}



/*
 * ---------------
 * -- Variáveis --
 * ---------------
 */


const transacao_genese = {
    'cabecalhos': [{'assinatura': '', 'id_saida': '', 'indice_saida': 0}],
    'corpos': [{
        'endereco': '046055b0a275fe7cddeec71245ee60f7271b40e9d8f8d0ad63d17ed5beafd9f801db8686fea5bfbec328c58aa17234b30eb9f7b42c58ccdc276061330c77706912',
        'valor': 50
    }],
    'id': '5d52042ff66fdef594eb853dd8d9d59f8b5be5d5ed4b823de3b824608d372968'
};

const bloco_genese: Bloco = new Bloco(
    0, '91a73664bc84c0baa1fc75ea6e4aa6d1d20c5df664c724e3159aefc2e1186627', '', 1465154705, [transacao_genese], 0, 0
);

let blockchain: Bloco[] = [bloco_genese];

let corpos_nao_processados: CorposNaoProcessados[] = processa_transacoes(blockchain[0].dados, [], 0);

const INTERVALO_GERACAO_BLOCOS: number = 10;

const INTERVALO_AJUSTE_DIFICULDADE: number = 10;



/*
 * -------------
 * -- Funções --
 * -------------
 */


/**
 * Recupera a blockchain.
 */
const get_blockchain = (): Bloco[] => {
    return blockchain;
}


/**
 * Recupera corpos não processados
 */
const get_corpos_nao_processados = (): CorposNaoProcessados[] => {
    return _.cloneDeep(corpos_nao_processados);;
}


/**
 * Atualiza corpos não processados com o parâmetro.
 * @param novos_corpos Novos valores
 */
const atualiza_corpos_nao_processados = (novos_corpos: CorposNaoProcessados[]) => {
    corpos_nao_processados = novos_corpos;
};


/**
 * Recupera último bloco
 */
const get_ultimo_bloco = (): Bloco => {
    return blockchain[blockchain.length - 1];
}


/**
 * Recupera a dificuldade da cadeia informada.
 * @param cadeia_de_blocos Cadeia de blocos a ser avaliada
 */
const get_dificuldade = (cadeia_de_blocos: Bloco[]): number => {
    // Retorna a dificuldade ajustada
    const ultimo_bloco: Bloco = cadeia_de_blocos[blockchain.length - 1];
    if (ultimo_bloco.indice % INTERVALO_AJUSTE_DIFICULDADE === 0 && ultimo_bloco.indice !== 0)
        return get_dificuldade_ajustada(ultimo_bloco, cadeia_de_blocos);
    // Senão retorna a própria dificuldade
    else
        return ultimo_bloco.dificuldade;
};


/**
 * Retorna a dificuldade ajustada da cadeia informada.
 * @param ultimo_bloco Último bloco da cadeia
 * @param cadeia_de_blocos Cadeia cuja dificuldade será avaliada
 */
const get_dificuldade_ajustada = (ultimo_bloco: Bloco, cadeia_de_blocos: Bloco[]) => {
    const utlimo_ajuste: Bloco = cadeia_de_blocos[blockchain.length - INTERVALO_AJUSTE_DIFICULDADE];
    const tempo_esperado: number = INTERVALO_GERACAO_BLOCOS * INTERVALO_AJUSTE_DIFICULDADE;
    const tempo_gasto: number = ultimo_bloco.timestamp - utlimo_ajuste.timestamp;
    
    if (tempo_gasto < tempo_esperado / 2)
        return utlimo_ajuste.dificuldade + 1;
    else if (tempo_gasto > tempo_esperado * 2)
        return utlimo_ajuste.dificuldade - 1;
    else
        return utlimo_ajuste.dificuldade;
};


/**
 * Recupera o timestamp atual.
 */
const get_timestamp_atual = (): number => {
    return Math.round(new Date().getTime() / 1000);
}


/**
 * Insere próximo bloco
 * @param dados_do_bloco Dados a serem inseridos no bloco
 */
const gera_proximo_bloco_raw = (dados_do_bloco: Transacao[]) => {
    const bloco_anterior: Bloco = get_ultimo_bloco();
    const dificuldade: number = get_dificuldade(get_blockchain());
    const proximo_indice: number = bloco_anterior.indice + 1;
    const proximo_timestamp: number = get_timestamp_atual();
    const novo_bloco: Bloco = encontra_bloco(proximo_indice, bloco_anterior.hash, proximo_timestamp, dados_do_bloco, dificuldade);

    if (add_bloco_na_cadeia(novo_bloco)) {
        broadcast_atualizacao();
        return novo_bloco;
    } else
        return null;
};


/**
 * Recupera transações não processadas da carteira.
 */
const get_transacoes_nao_processadas_da_carteira = () => {
    return encontra_transacoes_nao_processadas(get_chave_publica_carteira(), get_corpos_nao_processados());
};


/**
 * Gera o próximo bloco já com a transação coinbase.
 */
const gera_proximo_bloco = () => {
    const tran_coinbase: Transacao = get_transacao_coinbase(get_chave_publica_carteira(), get_ultimo_bloco().indice + 1);
    const dados_do_bloco: Transacao[] = [tran_coinbase].concat(get_pool_transacoes());
    return gera_proximo_bloco_raw(dados_do_bloco);
};


/**
 * Gera próximo bloco já com a transação.
 * @param endereco_recebedor Endereço do recebedor
 * @param valor Valor da transação
 */
const gera_proximo_bloco_com_transacao = (assinatura: string, endereco_recebedor: string, valor: number) => {
    if (!is_endereco_valido(endereco_recebedor))
        throw Error('Endereço inválido');
    if (typeof valor !== 'number')
        throw Error('Valor inválido');

    let ass: string = '';
    let priv: string = '';
    if(assinatura === null) {
        ass = get_chave_publica_carteira();
        priv = get_chave_privada_carteira();
    } else {
        ass = get_chave_publica(assinatura);
        priv = assinatura;
    }

    console.log('passou');
    // Monta a transação
    const tran_coinbase: Transacao = get_transacao_coinbase(ass, get_ultimo_bloco().indice + 1);
    const tx: Transacao = cria_transacao(endereco_recebedor, valor, priv, get_corpos_nao_processados(), get_pool_transacoes());
    const dados_do_bloco: Transacao[] = [tran_coinbase, tx];
    return gera_proximo_bloco_raw(dados_do_bloco);
};


/**
 * Encontra um bloco para as informações passadas.
 * @param indice Índice do bloco
 * @param hash_anterior Hash do bloco anterior
 * @param timestamp Timestamp de criação
 * @param dados Dados do bloco
 * @param dificuldade Dificuldade do bloco a ser encontrado
 */
const encontra_bloco = (indice: number, hash_anterior: string, timestamp: number, dados: Transacao[], dificuldade: number): Bloco => {
    let nonce = 0;
    while (true) {
        const hash: string = calcula_hash(indice, hash_anterior, timestamp, dados, dificuldade, nonce);
        if (hash_bate_dificuldade(hash, dificuldade))
            return new Bloco(indice, hash, hash_anterior, timestamp, dados, dificuldade, nonce);
        nonce++;
    }
};


/**
 * Recupera o saldo da carteira.
 */
const get_saldo_carteira = (chave_privada: string): number => {
    if(chave_privada === null) {
        return get_saldo(get_chave_publica_carteira(), get_corpos_nao_processados());
    }
    else {
        return get_saldo(get_chave_publica(chave_privada), get_corpos_nao_processados());
    }
};


/**
 * Envia a transação com as características informadas.
 * @param address Endereço recebedor
 * @param valor Valor a ser enviado
 */
const envia_transacao = (address: string, valor: number, assinatura: string): Transacao => {

    if(assinatura === '') {
        const tx: Transacao = cria_transacao(address, valor, get_chave_privada_carteira(), get_corpos_nao_processados(), get_pool_transacoes());
        add_transacao_no_pool(tx, get_corpos_nao_processados());
        broadcast_pool();
        return tx;
    }
    else {
        const tx: Transacao = cria_transacao(address, valor, assinatura, get_corpos_nao_processados(), get_pool_transacoes());
        add_transacao_no_pool(tx, get_corpos_nao_processados());
        broadcast_pool();
        return tx;
    }
};


/**
 * Calcula o hash para um bloco de transações.
 * @param bloco Bloco de transações que terá o hash calculado.
 */
const calcula_hash_para_bloco = (bloco: Bloco): string => {
    return calcula_hash(bloco.indice, bloco.hash_anterior, bloco.timestamp, bloco.dados, bloco.dificuldade, bloco.nonce);
}


/**
 * Calcula o hash para um bloco com as características informadas.
 * @param indice Índice do bloco
 * @param hash_anterior Hash do bloco anterior
 * @param timestamp Timestamp de criação
 * @param dados Dados do bloco
 * @param dificuldade Dificuldade do bloco
 * @param nonce Nonce do bloco
 */
const calcula_hash = (indice: number, hash_anterior: string, timestamp: number, dados: Transacao[], dificuldade: number, nonce: number): string => {
    return CryptoJS.SHA256(indice + hash_anterior + timestamp + dados + dificuldade + nonce).toString();
}


/**
 * Verifica a estrutura de dados do bloco.
 * @param bloco Bloco a ser verificado
 */
const is_estrutura_bloco_valida = (bloco: Bloco): boolean => {
    return typeof bloco.indice === 'number'
        && typeof bloco.hash === 'string'
        && typeof bloco.hash_anterior === 'string'
        && typeof bloco.timestamp === 'number'
        && typeof bloco.dados === 'object';
};


/**
 * Verifica a validade do bloco.
 * @param novo_bloco Bloco a ser verificado
 * @param bloco_anterior Bloco anterior
 */
const is_novo_bloco_valido = (novo_bloco: Bloco, bloco_anterior: Bloco): boolean => {
    if (!is_estrutura_bloco_valida(novo_bloco)) 
        return false;

    // Se os índices não batem
    if (bloco_anterior.indice + 1 !== novo_bloco.indice)
        return false;
    // Se os hashes não batem
    else if (bloco_anterior.hash !== novo_bloco.hash_anterior)
        return false;
    // Se o timestamp não base
    else if (!is_timestamp_valido(novo_bloco, bloco_anterior))
        return false;
    // Se o hash não é válido
    else if (!has_hash_valido(novo_bloco))
        return false;


    // Se chegou aqui é válido
    return true;
};


/**
 * Calcula a dificuldade acumuldade de uma cadeia
 * @param cadeia_de_blocos Cadeia de blocos base para o cálculo
 */
const get_dificuldade_acumulada = (cadeia_de_blocos: Bloco[]): number => {
    return cadeia_de_blocos
        .map((bloco) => {
            return bloco.dificuldade;
        })
        .map((dificuldade) => {
            return Math.pow(2, dificuldade);
        })
        .reduce((a, b) => a + b);
};


/**
 * Valida o timestamp do bloco informado.
 * @param novo_bloco Bloco a ser verificado
 * @param bloco_anterior Bloco anterior
 */
const is_timestamp_valido = (novo_bloco: Bloco, bloco_anterior: Bloco): boolean => {
    // Timestamp do bloco anterior deve ser menor, naturalmente
    return (bloco_anterior.timestamp - 60 < novo_bloco.timestamp) && novo_bloco.timestamp - 60 < get_timestamp_atual();
};


/**
 * Valida o hash de um determinado bloco.
 * @param bloco Bloco cujo hash será validado
 */
const has_hash_valido = (bloco: Bloco): boolean => {

    // Se não é o que deveria ser
    if (!hash_bate_com_bloco(bloco))
        return false;

    // Se não tem a dificuldade desejada
    if (!hash_bate_dificuldade(bloco.hash, bloco.dificuldade)) 
        return false;

    return true;
};


/**
 * Verifica se o hash do bloco é compatível com o que deveria ser.
 * @param bloco Bloco informado
 */
const hash_bate_com_bloco = (bloco: Bloco): boolean => {
    const blockHash: string = calcula_hash_para_bloco(bloco);
    return blockHash === bloco.hash;
};


/**
 * Verifica se o hash bate com a dificuldade informada.
 * @param hash Hash a ser verificado
 * @param dificuldade Dificuldade desejada
 */
const hash_bate_dificuldade = (hash: string, dificuldade: number): boolean => {
    const hash_binario: string = hexadecimal_para_binario(hash);
    const prefixo: string = '0'.repeat(dificuldade);
    return hash_binario.startsWith(prefixo);
};


/**
 * Verifica se a cadeia informada é válida
 * @param cadeia Cadeia a ser validada
 */
const is_cadeia_valida = (cadeia: Bloco[]): CorposNaoProcessados[] => {

    // Verifica o bloco genese
    const genese_valido = (bloco: Bloco): boolean => {
        return JSON.stringify(bloco) === JSON.stringify(bloco_genese);
    };

    if (!genese_valido(cadeia[0]))
        return null;


    // Valida cada bloco
    let corpos_nao_processados: CorposNaoProcessados[] = [];

    for (let i = 0; i < cadeia.length; i++) {

        // Valida o bloco
        const currentBlock: Bloco = cadeia[i];
        if (i !== 0 && !is_novo_bloco_valido(cadeia[i], cadeia[i - 1]))
            return null;

        // Valida suas transações
        corpos_nao_processados = processa_transacoes(currentBlock.dados, corpos_nao_processados, currentBlock.indice);
        if (corpos_nao_processados === null)
            return null;
    }

    return corpos_nao_processados;
};


/**
 * Adiciona o bloco recebido na cadeia.
 * @param novo_bloco Bloco a ser adicionado
 */
const add_bloco_na_cadeia = (novo_bloco: Bloco): boolean => {
    if (is_novo_bloco_valido(novo_bloco, get_ultimo_bloco())) {
        const retVal: CorposNaoProcessados[] = processa_transacoes(novo_bloco.dados, get_corpos_nao_processados(), novo_bloco.indice);

        if (retVal === null)
            return false;
        else {
            blockchain.push(novo_bloco);
            atualiza_corpos_nao_processados(retVal);
            atualiza_pool(corpos_nao_processados);
            return true;
        }
    }

    return false;
};


/**
 * Atualiza a blockchain atual.
 * @param novos_blocos Blocos representando a nova cadeia
 */
const atualiza_cadeia = (novos_blocos: Bloco[]) => {
    const corpos_nao_processados = is_cadeia_valida(novos_blocos);
    const valida_cadeia: boolean = corpos_nao_processados !== null;

    if (valida_cadeia && get_dificuldade_acumulada(novos_blocos) > get_dificuldade_acumulada(get_blockchain())) {
        blockchain = novos_blocos;
        atualiza_corpos_nao_processados(corpos_nao_processados);
        atualiza_pool(corpos_nao_processados);
        broadcast_atualizacao();
    }
};


/**
 * Adiciona a transação recebida no pool.
 * @param transaction Transação recebida
 */
const interpreta_transacao_recebida = (transaction: Transacao) => {
    add_transacao_no_pool(transaction, get_corpos_nao_processados());
};



/*
 * -----------------
 * -- Exportações --
 * -----------------
 */


export { Bloco, get_blockchain, get_corpos_nao_processados, get_ultimo_bloco, envia_transacao, gera_proximo_bloco_raw, gera_proximo_bloco, gera_proximo_bloco_com_transacao, interpreta_transacao_recebida, get_transacoes_nao_processadas_da_carteira, get_saldo_carteira, is_estrutura_bloco_valida, atualiza_cadeia, add_bloco_na_cadeia };