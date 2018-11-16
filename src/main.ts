/*
 * -----------------
 * -- Importações --
 * -----------------
 */


import * as  bodyParser from 'body-parser';
import * as express from 'express';
import * as _ from 'lodash';
import { Bloco, gera_proximo_bloco, gera_proximo_bloco_com_transacao, gera_proximo_bloco_raw, get_saldo_carteira, get_blockchain, get_transacoes_nao_processadas_da_carteira, get_corpos_nao_processados, envia_transacao } from './blockchain';
import { conecta_aos_peers, get_sockets, inicia_servidor_p2p } from './p2p';
import { CorposNaoProcessados } from './transaction';
import { get_pool_transacoes } from './transactionPool';
import { get_chave_publica_carteira, inicia_carteira } from './wallet';



/*
 * ---------------
 * -- Variáveis --
 * ---------------
 */


const httpPort: number = parseInt(process.env.HTTP_PORT) || 3001;
const p2pPort: number = parseInt(process.env.P2P_PORT) || 6001;



/*
 * -------------
 * -- Funções --
 * -------------
 */


/**
 * Inicia o servidor na porta informada.
 * @param porta Porta que receberá as conexões
 */
const inicia_servidor_http = (porta: number) => {
    const app = express();
    app.use(bodyParser.json());

    app.use((err, req, res, next) => {
        if (err)
            res.status(400).send(err.message);
    });

    // GET blockchain
    app.get('/blocos', (req, res) => {
        res.send(get_blockchain());
    });

    // GET informações de um bloco específico
    app.get('/block/:hash', (req, res) => {
        const block = _.find(get_blockchain(), {'hash' : req.params.hash});
        res.send(block);
    });

    // GET informações da transação
    app.get('/transacao/:id', (req, res) => {
        const tx = _(get_blockchain())
            .map((blocks) => {
                return blocks.dados;
            })
            .flatten()
            .find({'id': req.params.id});
        res.send(tx);
    });

    // GET informações do endereço
    app.get('/endereco/:endereco', (req, res) => {
        const corpos: CorposNaoProcessados[] = _.filter(get_corpos_nao_processados(), (corpo) => corpo.endereco === req.params.endereco);
        res.send({'corpos': corpos});
    });

    // GET nas transações não processadas
    app.get('/transacoesNaoProcessadas', (req, res) => {
        res.send(get_corpos_nao_processados());
    });

    // GET nas transações não processadas da carteira
    app.get('/minhasTransacoesNaoProcessadas', (req, res) => {
        res.send(get_transacoes_nao_processadas_da_carteira());
    });

    // POST para minerar os blocos
    app.post('/mineraBlocos', (req, res) => {
        if (req.body.dados == null)
            return;

        const novo_bloco: Bloco = gera_proximo_bloco_raw(req.body.dados);
        if (novo_bloco === null)
            res.status(400).send('Não pode gerar os blocos');
        else
            res.send(novo_bloco);
    });

    // POST para minerar um novo bloco
    app.post('/mineraBloco', (req, res) => {
        const novo_bloco: Bloco = gera_proximo_bloco();
        if (novo_bloco === null)
            res.status(400).send('Não pode gerar os blocos');
        else
            res.send(novo_bloco);
    });

    // GET saldo da carteira
    app.get('/saldo', (req, res) => {
        const saldo: number = get_saldo_carteira();
        res.send({'saldo': saldo});
    });

    // GET nas informações do endereço
    app.get('/endereco', (req, res) => {
        const endereco: string = get_chave_publica_carteira();
        res.send({'endereco': endereco});
    });

    // POST para minerar transação
    app.post('/mineraTransacao', (req, res) => {
        const endereco = req.body.endereco;
        const valor = req.body.valor;
        try {
            const resp = gera_proximo_bloco_com_transacao(endereco, valor);
            res.send(resp);
        } catch (e) {
            console.log(e.message);
            res.status(400).send(e.message);
        }
    });

    // POST para enviar uma transação
    app.post('/enviaTransacao', (req, res) => {
        try {
            const endereco = req.body.endereco;
            const valor = req.body.valor;

            if (endereco === undefined || valor === undefined)
                throw Error('Endereço ou valor inválido');

            const resp = envia_transacao(endereco, valor);
            res.send(resp);
        } catch (e) {
            console.log(e.message);
            res.status(400).send(e.message);
        }
    });

    // Recupera o pool de transações
    app.get('/pool', (req, res) => {
        res.send(get_pool_transacoes());
    });

    // GET nos peers
    app.get('/peers', (req, res) => {
        res.send(get_sockets().map((s: any) => s._socket.remoteAddress + ':' + s._socket.remotePort));
    });

    // POST para adicionar peer
    app.post('/adicionaPeer', (req, res) => {
        conecta_aos_peers(req.body.peer);
        res.send();
    });

    // POST para parar o servidor
    app.post('/parar', (req, res) => {
        res.send({'msg' : 'Parando servidor'});
        process.exit();
    });

    app.listen(porta, () => {
        console.log('HTTP na porta: ' + porta);
    });
};



/*
 * --------------
 * -- Chamadas --
 * --------------
 */


inicia_servidor_http(httpPort);
inicia_servidor_p2p(p2pPort);
inicia_carteira();