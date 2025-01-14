import { expect } from 'chai'
import { PubKeyHash, toHex, buildPublicKeyHashScript } from 'scrypt-ts'
import { AnyoneCanSpend } from '../../src/contracts/acs'
import { inputIndex } from './util/txHelper'
import { crypto, PublicKey, PrivateKey, Transaction } from 'bsv'

const Signature = crypto.Signature
// Note: ANYONECANPAY
const sighashType =
    Signature.SIGHASH_ANYONECANPAY |
    Signature.SIGHASH_SINGLE |
    Signature.SIGHASH_FORKID

describe('Test SmartContract `AnyoneCanSpend`', () => {
    before(async () => {
        await AnyoneCanSpend.compile()
    })

    it('should transpile contract `AnyoneCanSpend` successfully.', async () => {
        const privateKeyAlice = PrivateKey.fromRandom('testnet')
        console.log(`Private key generated: '${privateKeyAlice.toWIF()}'`)

        const publicKeyAlice = PublicKey.fromPrivateKey(privateKeyAlice)
        const publicKeyHashAlice = crypto.Hash.sha256ripemd160(
            publicKeyAlice.toBuffer()
        )

        const anyoneCanSpend = new AnyoneCanSpend(
            PubKeyHash(toHex(publicKeyHashAlice))
        )

        const initBalance = 1000

        const outputIndex = 0
        const callTx: Transaction = new Transaction()
            .addDummyInput(anyoneCanSpend.lockingScript, initBalance)
            .setOutput(outputIndex, () => {
                // bind contract & tx locking relation
                return new Transaction.Output({
                    // use the locking script of newInstance, as the locking script of the new UTXO
                    script: buildPublicKeyHashScript(
                        PubKeyHash(toHex(publicKeyHashAlice))
                    ),
                    satoshis: 1,
                })
            })
            .setInputScript(
                {
                    inputIndex,
                    sigtype: sighashType,
                },
                (tx: Transaction) => {
                    // bind contract & tx unlocking relation
                    // use the cloned version because this callback will be executed multiple times during tx building process,
                    // and calling contract method may have side effects on its properties.
                    return anyoneCanSpend.getUnlockingScript((cloned) => {
                        // call previous counter's public method to get the unlocking script.
                        cloned.unlockFrom = { tx, inputIndex }
                        cloned.unlock(1n)
                    })
                }
            )
            .seal()

        const result = callTx.verifyInputScript(0)

        expect(result.success, result.error).to.eq(true)
    })
})
