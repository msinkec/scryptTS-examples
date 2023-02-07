import { P2PKH } from '../../src/contracts/p2pkh'
import {
    inputIndex,
    inputSatoshis,
    outputIndex,
    testnetDefaultSigner,
} from './util/txHelper'
import { myAddress, myPublicKeyHash } from './util/privateKey'

import { PubKey, Ripemd160, Sig, toHex, utxoFromOutput } from 'scrypt-ts'
import { Transaction } from 'bsv'

async function main() {
    await P2PKH.compile()
    const p2pkh = new P2PKH(Ripemd160(toHex(myPublicKeyHash)))

    // connect to a signer
    await p2pkh.connect(await testnetDefaultSigner)

    // deploy
    const deployTx = await p2pkh.deploy(inputSatoshis)
    console.log('P2PKH contract deployed: ', deployTx.id)

    // call
    const changeAddress = await (await testnetDefaultSigner).getDefaultAddress()
    const unsignedCallTx: Transaction = await new Transaction()
        .addInputFromPrevTx(deployTx)
        .change(changeAddress)
        .setInputScriptAsync({ inputIndex }, (tx: Transaction) => {
            // bind contract & tx unlocking relation
            p2pkh.unlockFrom = { tx, inputIndex }
            // use the cloned version because this callback may be executed multiple times during tx building process,
            // and calling contract method may have side effects on its properties.
            return p2pkh.getUnlockingScript(async (cloned) => {
                const spendingUtxo = utxoFromOutput(deployTx, outputIndex)

                const sigResponses = await (
                    await testnetDefaultSigner
                ).getSignatures(tx.toString(), [
                    {
                        inputIndex,
                        satoshis: spendingUtxo.satoshis,
                        scriptHex: spendingUtxo.script,
                        address: myAddress,
                    },
                ])

                const sigs = sigResponses.map((sigResp) => sigResp.sig)
                const pubKeys = sigResponses.map((sigResp) => sigResp.publicKey)

                cloned.unlock(Sig(sigs[0]), PubKey(pubKeys[0]))
            })
        })
    const callTx = await (
        await testnetDefaultSigner
    ).signAndsendTransaction(unsignedCallTx)
    console.log('P2PKH contract called: ', callTx.id)
}

describe('Test SmartContract `P2PKH` on testnet', () => {
    it('should succeed', async () => {
        await main()
    })
})
