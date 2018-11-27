/*
 * -----------------
 * -- Importações --
 * -----------------
 */


import * as WebSocket from 'ws';
import { Server } from 'ws';
import { add_bloco_na_cadeia, Bloco, get_blockchain, get_ultimo_bloco, interpreta_transacao_recebida, is_estrutura_bloco_valida, atualiza_cadeia } from './blockchain';
import { Transacao } from './transaction';
import { get_pool_transacoes } from './transactionPool';



/*
 * ----------------
 * -- Estruturas --
 * ----------------
 */


/**
 * Enum de tipos possíveis de mensagem
 */
enum TipoMensagem {
    QUERY_LATEST = 0,
    QUERY_ALL = 1,
    RESPONSE_BLOCKCHAIN = 2,
    QUERY_TRANSACTION_POOL = 3,
    RESPONSE_TRANSACTION_POOL = 4
}


/**
 * Estrutura de mensagem
 */
class Mensagem {
    public type: TipoMensagem;
    public data: any;
}

/*
 * ---------------
 * -- Variáveis --
 * ---------------
 */


let sockets: WebSocket[] = [];



/*
 * -------------
 * -- Funções --
 * -------------
 */


/**
 * Inicia um servidor P2P na porta informada.
 * @param porta_p2p Porta que será usada
 */
const inicia_servidor_p2p = (porta_p2p: number) => {
    const servidor: Server = new WebSocket.Server({port: porta_p2p});
    servidor.on('connection', (ws: WebSocket) => {
        inicia_conexao(ws);
    });

    console.log('Porta P2P aguardando conexão: ' + porta_p2p);
};


/**
 * Recupera os sockets.
 */
const get_sockets = () => {
    return sockets;
}


/**
 * Inicia uma conexão no socket informado.
 * @param ws Socket que será usado
 */
const inicia_conexao = (ws: WebSocket) => {
    sockets.push(ws);

    sockets = sockets.filter(function() {
        return true;
    });
    inicia_interpretador_mensagens(ws);
    inicia_interpretador_erros(ws);

    write(ws, monta_msg_tamanho_cadeia());

    // Faz o broadcast da pool
    setTimeout(() => {
        broadcast(monta_msg_query_pool());
    }, 500);
};


/**
 * Convert o JSON informado para o tipo T
 * @param data Dados a serem convertidos
 */
const json_to_object = <T>(data: string): T => {
    try {
        return JSON.parse(data);
    } catch (e) {
        console.log(e);
        return null;
    }
};


/**
 * Inicia um interpretador de mensagens.
 * @param ws Socket que está sendo usado
 */
const inicia_interpretador_mensagens = (ws: WebSocket) => {
    ws.on('message', (data: string) => {
        
        try {
            const mensagem: Mensagem = json_to_object<Mensagem>(data);

            // Se não converteu a mensagem
            if (mensagem === null)
                return;
            
            // Lida com as mensagens
            switch (mensagem.type) {
                // Recupera última mensagem
                case TipoMensagem.QUERY_LATEST:
                    write(ws, monta_msg_ultimo_bloco());
                    break;
                // Recupera cadeia
                case TipoMensagem.QUERY_ALL:
                    write(ws, monta_msg_blockchain());
                    break;
                // Blockchain
                case TipoMensagem.RESPONSE_BLOCKCHAIN:
                    const blocos_recebidos: Bloco[] = json_to_object<Bloco[]>(mensagem.data);
                    
                    if (blocos_recebidos === null)
                        break;

                    responde_blockchain(blocos_recebidos);
                    break;
                // Pool
                case TipoMensagem.QUERY_TRANSACTION_POOL:
                    write(ws, monta_msg_response_pool());
                    break;
                // Atualiza pool
                case TipoMensagem.RESPONSE_TRANSACTION_POOL:
                    const transacoes_recebidas: Transacao[] = json_to_object<Transacao[]>(mensagem.data);
                    if (transacoes_recebidas === null) 
                        break;

                    transacoes_recebidas.forEach((transaction: Transacao) => {
                        try {
                            interpreta_transacao_recebida(transaction);
                            // Se não deu erro atualiza a rede
                            broadcast_pool();
                        } catch (e) {
                            console.log(e.mensagem);
                        }
                    });
                    break;
            }
        } catch (e) {
            console.log(e);
        }
    });
};


/**
 * Escreve a mensagem no socket.
 * @param ws Socket a ser usado
 * @param mensagem Mensagem a ser enviada
 */
const write = (ws: WebSocket, mensagem: Mensagem): void => {
    ws.send(JSON.stringify(mensagem));
}


/**
 * Envia a mensagem via broadcast aos peers.
 * @param mensagem Mensagem a ser enviada
 */
const broadcast = (mensagem: Mensagem): void => {
    console.log('mensagem');
    sockets.forEach((socket) => write(socket, mensagem));
}


/**
 * Monta mensagem do tamanho da cadeia
 */
const monta_msg_tamanho_cadeia = (): Mensagem => {
    return ({
        'type': TipoMensagem.QUERY_LATEST,
        'data': null
    });
}

/**
 * Monta mensagem da blockchain
 */
const monta_msg_all = (): Mensagem => {
    return ({
        'type': TipoMensagem.QUERY_ALL,
        'data': null
    });
}


/**
 * Monta mensagem da blockchain
 */
const monta_msg_blockchain = (): Mensagem => {
    return ({
        'type': TipoMensagem.RESPONSE_BLOCKCHAIN,
        'data': JSON.stringify(get_blockchain())
    });
}


/**
 * Monta mensagem de último bloco
 */
const monta_msg_ultimo_bloco = (): Mensagem => {
    return ({
        'type': TipoMensagem.RESPONSE_BLOCKCHAIN,
        'data': JSON.stringify([get_ultimo_bloco()])
    });
}


/**
 * Monta mensagem de query na pool
 */
const monta_msg_query_pool = (): Mensagem => {
    return ({
        'type': TipoMensagem.QUERY_TRANSACTION_POOL,
        'data': null
    });
}


/**
 * Monta mensagem de resposta ao pool
 */
const monta_msg_response_pool = (): Mensagem => {
    return ({
        'type': TipoMensagem.RESPONSE_TRANSACTION_POOL,
        'data': JSON.stringify(get_pool_transacoes())
    });
}


/**
 * Incia um interpretador de erros.
 * @param ws Socket que será usado
 */
const inicia_interpretador_erros = (ws: WebSocket) => {
    const fecha_conexao = (myWs: WebSocket) => {
        console.log('Falha ao se conectar ao peer: ' + myWs.url);
        sockets.splice(sockets.indexOf(myWs), 1);
    };

    ws.on('close', () => fecha_conexao(ws));
    ws.on('error', () => fecha_conexao(ws));
};


/**
 * Atualiza blockchain de acordo com necessidade.
 * @param blocos_recebidos Blocos recebidos
 */
const responde_blockchain = (blocos_recebidos: Bloco[]) => {
    if (blocos_recebidos.length === 0) 
        return;

    // Verifica validade do último bloco recebido
    const ultimo_bloco_recebido: Bloco = blocos_recebidos[blocos_recebidos.length - 1];
    if (!is_estrutura_bloco_valida(ultimo_bloco_recebido))
        return;

    // Verifica último bloco na cadeia
    const ultimo_bloco_tratado: Bloco = get_ultimo_bloco();

    // Se o índice for mais atual
    if (ultimo_bloco_recebido.indice > ultimo_bloco_tratado.indice)
        // Se o hash bate
        if (ultimo_bloco_tratado.hash === ultimo_bloco_recebido.hash_anterior)
            // Se pode adicionar
            if (add_bloco_na_cadeia(ultimo_bloco_recebido))
                broadcast(monta_msg_ultimo_bloco());
        // Se o bloco for 1 só
        else if (blocos_recebidos.length === 1)
            broadcast(monta_msg_all());
        else
            atualiza_cadeia(blocos_recebidos);
};


/**
 * Envia atualização via broadcast.
 */
const broadcast_atualizacao = (): void => {
    broadcast(monta_msg_ultimo_bloco());
};


/**
 * Conecta aos peers.
 * @param novo_peer Novo peer
 */
const conecta_aos_peers = (novo_peer: string): void => {
    const ws: WebSocket = new WebSocket(novo_peer);
    ws.on('open', () => {
        inicia_conexao(ws);
    });
    ws.on('error', () => {
        console.log('Falha de conexão');
    });
};


/**
 * Envia a pool via broadcast.
 */
const broadcast_pool = () => {
    broadcast(monta_msg_response_pool());
};



/*
 * -----------------
 * -- Exportações --
 * -----------------
 */


export {conecta_aos_peers, broadcast_atualizacao, broadcast_pool, inicia_servidor_p2p, get_sockets};