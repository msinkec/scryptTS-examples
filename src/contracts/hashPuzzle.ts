import {
    assert,
    ByteString,
    method,
    prop,
    Sha256,
    sha256,
    SmartContract,
    UTXO,
} from 'scrypt-ts'

import { Transaction } from 'bsv'

export class HashPuzzle extends SmartContract {
    @prop()
    sha256: Sha256

    constructor(sha256: Sha256) {
        super(...arguments)
        this.sha256 = sha256
    }

    // This method can only be unlocked if providing the real hash preimage of
    // the specified SHA-256 hash.
    @method()
    public unlock(data: ByteString) {
        assert(this.sha256 == sha256(data), 'hashes are not equal')
    }

    // Local method to construct deployment TX.
    getDeployTx(utxos: UTXO[], satoshis: number): Transaction {
        return new Transaction().from(utxos).addOutput(
            new Transaction.Output({
                script: this.lockingScript,
                satoshis: satoshis,
            })
        )
    }

    // Local method to construct TX that calls deployed contract.
    getCallTx(data: ByteString, prevTx: Transaction): Transaction {
        return new Transaction()
            .addInputFromPrevTx(prevTx)
            .setInputScript(0, () => {
                return this.getUnlockingScript((self) => self.unlock(data))
            })
    }
}
