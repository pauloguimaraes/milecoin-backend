# Milecoin

Seguimos as instruções do tutorial do [lhartikk](https://lhartikk.github.io/)! Recomendamos fortemente que conheça o projeto da [NaiveCoin](https://github.com/lhartikk/naivecoin), que ensina passo a passo a montar sua própria criptomoeda.


## Configurando o projeto

É necessário possuir o [Node.JS](https://nodejs.org/en/download/) instalado na sua máquina para configurar o ambiente, além do gerenciador de pacotes [NPM](https://www.npmjs.com/). 
Uma vez configurado, execute os comandos no diretório raiz do projeto:
```
npm install
npm start
```

## Executando o projeto

Existem algumas operações básicas principais que podem ser feitas nessa implementação de blockchain. Mas antes de nos atermos a elas é necessário ter em mente que:

1. Cada nó da rede (instância desse projeto executando) irá possuir seu endereço e todas as transações enviadas para esse nó sairão do saldo desse endereço.
2. Sua transação só sairá do pool quando um bloco for minerado.

Sigamos para as operações que podem ser executadas através da API:

### Recupera a blockchain
```
curl http://ec2-52-14-231-202.us-east-2.compute.amazonaws.com:3001/blocos
```

### Gera chaves
```
curl http://ec2-52-14-231-202.us-east-2.compute.amazonaws.com/chaves
```

### Envia transação
```
curl -H "Content-type: application/json" --data '{"endereco": "04bfcab8722991ae774db48f934ca79cfb7dd991229153b9f732ba5334aafcd8e7266e47076996b55a14bf9913ee3145ce0cfc1372ada8ada74bd287450313534b", "valor" : 35}' http://ec2-52-14-231-202.us-east-2.compute.amazonaws.com:3001/enviaTransacao
```

### Envia transação de outra carteira
```
curl -H "Content-type: application/json" --data '{"endereco": "04bfcab8722991ae774db48f934ca79cfb7dd991229153b9f732ba5334aafcd8e7266e47076996b55a14bf9913ee3145ce0cfc1372ada8ada74bd287450313534b", "valor" : 35, "assinatura": "CHAVE_PRIVADA_DA_CARTEIRA"}' http://ec2-52-14-231-202.us-east-2.compute.amazonaws.com:3001/enviaTransacao
```

### Minera um bloco
Essa função minera um bloco, registrando as operações no pool nele
```
curl -X POST http://ec2-52-14-231-202.us-east-2.compute.amazonaws.com:3001/mineraBlocos
```

### Consulta pool de transações
```
curl http://ec2-52-14-231-202.us-east-2.compute.amazonaws.com:3001/pool
```

### Minera uma transação
Envia uma transação e já a minera:
```
curl -H "Content-type: application/json" --data '{"endereco": "04bfcab8722991ae774db48f934ca79cfb7dd991229153b9f732ba5334aafcd8e7266e47076996b55a14bf9913ee3145ce0cfc1372ada8ada74bd287450313534b", "valor" : 35}' http://ec2-52-14-231-202.us-east-2.compute.amazonaws.com:3001/mineraTransacao
```

### Consulta saldo
Consulta o saldo da carteira hospedada no endereço:
```
curl http://ec2-52-14-231-202.us-east-2.compute.amazonaws.com:3001/saldo
```

### Consulta informações de um endereço específico
```
curl http://ec2-52-14-231-202.us-east-2.compute.amazonaws.com:3001/address/04f72a4541275aeb4344a8b049bfe2734b49fe25c08d56918f033507b96a61f9e3c330c4fcd46d0854a712dc878b9c280abe90c788c47497e06df78b25bf60ae64
```

### Adiciona um peer
Adiciona o peer executando na porta 3001 (por exemplo) à rede:
```
curl -H "Content-type:application/json" --data '{"peer" : "ws://ec2-52-14-231-202.us-east-2.compute.amazonaws.com:6001"}' http://localhost:3001/addPeer
```

### Consulta peers conectados
Consulta todos os peers conectados na rede:
```
curl http://ec2-52-14-231-202.us-east-2.compute.amazonaws.com:3001/peers
```
