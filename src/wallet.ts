/*
 * -----------------
 * -- Importações --
 * -----------------
 */


import { ec } from 'elliptic';
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'fs';
import * as _ from 'lodash';
import { get_chave_publica, get_id_transacao, assina_cabecalho, Transacao, CabecalhoTran, CorpoTran, CorposNaoProcessados } from './transaction';



/*
 * ---------------
 * -- Variáveis --
 * ---------------
 */


const EC = new ec('secp256k1');
const arquivo_chave_privada = process.env.PRIVATE_KEY || 'node/wallet/private_key';



/*
 * -------------
 * -- Funções --
 * -------------
 */


/**
 * Recupera a chave privada da carteira.
 */
const get_chave_privada_carteira = (): string => {
    const buffer = readFileSync(arquivo_chave_privada, 'utf8');
    return buffer.toString();
};


/**
 * Recupera a chave pública da carteira.
 */
const get_chave_publica_carteira = (): string => {
    const chave_privada = get_chave_privada_carteira();
    const key = EC.keyFromPrivate(chave_privada, 'hex');
    return key.getPublic().encode('hex');
};


/**
 * Gera uma chave privada para a carteira.
 */
const gera_chave_privada = (): string => {
    const keyPair = EC.genKeyPair();
    const chave_privada = keyPair.getPrivate();
    return chave_privada.toString(16);
};


/**
 * Inicia a carteira.
 */
const inicia_carteira = () => {
    // Verifica se já existe
    if (existsSync(arquivo_chave_privada))
        return;
    
    // Gera uma nova chave
    const nova_chave_privada = gera_chave_privada();
    writeFileSync(arquivo_chave_privada, nova_chave_privada);
};


/**
 * Exclui a carteira.
 */
const exclui_carteira = () => {
    if (existsSync(arquivo_chave_privada))
        unlinkSync(arquivo_chave_privada);
};


/**
 * Recupera o saldo da carteira.
 * @param endereco Endereço da carteira
 * @param transacoes_nao_proc Corpos ainda não processados
 */
const get_saldo = (endereco: string, transacoes_nao_proc: CorposNaoProcessados[]): number => {
    return _(encontra_transacoes_nao_processadas(endereco, transacoes_nao_proc))
        .map((corpo: CorposNaoProcessados) => {
            return corpo.valor;
        })
        .sum();
};


/**
 * Recupera transações não processadas para determinada carteira.
 * @param endereco_dono Endereço da carteira em questão
 * @param transacoes_nao_proc Corpos ainda não processados
 */
const encontra_transacoes_nao_processadas = (endereco_dono: string, transacoes_nao_proc: CorposNaoProcessados[]) => {
    return _.filter(transacoes_nao_proc, (corpo: CorposNaoProcessados) => corpo.endereco === endereco_dono);
};


/**
 * Encontra corpos com determinado valor.
 * @param valor Valor que está sendo buscado
 * @param corpos_nao_processados Transações não processadas
 */
const encontra_corpos_para_valor = (valor: number, corpos_nao_processados: CorposNaoProcessados[]) => {
    
    let valor_atual = 0;
    const corpos_inclusos = [];

    for (const corpo of corpos_nao_processados) {
        corpos_inclusos.push(corpo);

        valor_atual = valor_atual + corpo.valor;
        if (valor_atual >= valor) {
            const saldo_restante = valor_atual - valor;
            return {corpos_inclusos, saldo_restante};
        }
    }

    throw Error();
};


/**
 * Cria corpo da transação.
 * @param endereco_recebedor Endereço do recebedor
 * @param endereco_enviador Endereço do enviador
 * @param valor Valor enviado
 * @param saldo_restante Saldo restante
 */
const cria_corpo = (endereco_recebedor: string, endereco_enviador: string, valor, saldo_restante: number) => {
    
    const corpo: CorpoTran = new CorpoTran(endereco_recebedor, valor);
    
    if (saldo_restante === 0)
        return [corpo];
    else {
        // Cria um corpo de transação do saldo
        const saldo_transacao = new CorpoTran(endereco_enviador, saldo_restante);
        return [corpo, saldo_transacao];
    }
};


/**
 * Filtra corpos no pool de transações.
 * @param transacoes_nao_proc Corpos ainda não processados
 * @param pool_transacoes Pool de transações
 */
const filtra_pool = (transacoes_nao_proc: CorposNaoProcessados[], pool_transacoes: Transacao[]): CorposNaoProcessados[] => {
    // Recupera os cabeçalhos no pool
    const cabecalhos: CabecalhoTran[] = _(pool_transacoes)
        .map((tx: Transacao) => {
            return tx.cabecalhos;
        }).flatten().value();

    // Remove as transações possíveis (que estão na lista que passamos nos parâmetros)
    const removiveis: CorposNaoProcessados[] = [];
    for (const corpo_np of transacoes_nao_proc) {
        const cabec = _.find(cabecalhos, (cabecalho: CabecalhoTran) => {
            return cabecalho.indice_saida === corpo_np.indice_saida && cabecalho.id_saida === corpo_np.id_saida;
        });

        if (cabec === undefined) {

        } else
            removiveis.push(corpo_np);
    }

    return _.without(transacoes_nao_proc, ...removiveis);
};


/**
 * Cria uma transação.
 * @param endereco_recebedor Endereço do recebedor dos valores
 * @param valor Valor enviado
 * @param chave_privada Chave privada que será usada para assinar
 * @param transacoes_nao_proc Lista de transações não processadas
 * @param txPool Pool de transações
 */
const cria_transacao = (endereco_recebedor: string, valor: number, chave_privada: string,
                           transacoes_nao_proc: CorposNaoProcessados[], txPool: Transacao[]): Transacao => {
    // Filtra transações não processadas para esse endereço
    const endereco_enviador: string = get_chave_publica(chave_privada);
    const transacoes_naoproc_para_endereco = transacoes_nao_proc.filter((corpo: CorposNaoProcessados) => corpo.endereco === endereco_enviador);
    const corpos_nao_processados = filtra_pool(transacoes_naoproc_para_endereco, txPool);

    // Filtra transações semelhantes no pool
    const {corpos_inclusos, saldo_restante} = encontra_corpos_para_valor(valor, corpos_nao_processados);

    const cabecalho_nao_autenticado = (corpo_np: CorposNaoProcessados) => {
        const cabec: CabecalhoTran = new CabecalhoTran();
        cabec.id_saida = corpo_np.id_saida;
        cabec.indice_saida = corpo_np.indice_saida;
        return cabec;
    };

    // Gera a transação
    const cabecalhos_nao_assinados: CabecalhoTran[] = corpos_inclusos.map(cabecalho_nao_autenticado);
    const tx: Transacao = new Transacao();
    tx.cabecalhos = cabecalhos_nao_assinados;
    tx.corpos = cria_corpo(endereco_recebedor, endereco_enviador, valor, saldo_restante);
    tx.id = get_id_transacao(tx);

    // Assina os cabeçalhos
    tx.cabecalhos = tx.cabecalhos.map((cabec: CabecalhoTran, index: number) => {
        cabec.assinatura = assina_cabecalho(tx, index, chave_privada, transacoes_nao_proc);
        return cabec;
    });

    return tx;
};



/*
 * -----------------
 * -- Exportações --
 * -----------------
 */


export {cria_transacao, get_chave_publica_carteira, get_chave_privada_carteira, get_saldo, gera_chave_privada, inicia_carteira, exclui_carteira, encontra_transacoes_nao_processadas};