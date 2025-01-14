import {
    assert,
    buildPublicKeyHashScript,
    hash256,
    method,
    prop,
    PubKey,
    PubKeyHash,
    Sig,
    SmartContract,
    Utils,
    UTXO,
} from 'scrypt-ts'

import { Transaction, PrivateKey } from 'bsv'

export class Crowdfund extends SmartContract {
    @prop()
    recipient: PubKeyHash

    @prop()
    contributor: PubKey

    @prop()
    deadline: bigint

    @prop()
    target: bigint

    constructor(
        recipient: PubKeyHash,
        contributor: PubKey,
        deadline: bigint,
        target: bigint
    ) {
        super(...arguments)
        this.recipient = recipient
        this.contributor = contributor
        this.deadline = deadline
        this.target = target
    }

    // Method to collect pledged fund.
    @method()
    public collect(raisedAmount: bigint) {
        // Ensure raised amount actually reached the target.
        assert(
            raisedAmount >= this.target,
            'raisedAmount is less than this.target'
        )

        // Funds go to the recipient.
        const lockingScript = Utils.buildPublicKeyHashScript(this.recipient)

        // Ensure the payment output to the recipient is actually in the unlocking TX.
        const output = Utils.buildOutput(lockingScript, raisedAmount)
        assert(
            hash256(output) == this.ctx.hashOutputs,
            'hashOutputs check failed'
        )
    }

    // Contributors can be refunded after the deadline.
    @method()
    public refund(sig: Sig) {
        // Require nLocktime enabled https://wiki.bitcoinsv.io/index.php/NLocktime_and_nSequence
        assert(this.ctx.sequence < 0xffffffffn, 'require nLocktime enabled')

        // Check if using block height.
        if (this.deadline < 500000000) {
            // Enforce nLocktime field to also use block height.
            assert(this.ctx.locktime < 500000000)
        }
        assert(this.ctx.locktime >= this.deadline, 'fundraising expired')
        assert(this.checkSig(sig, this.contributor), 'signature check failed')
    }

    // Local method to construct deployment TX.
    getDeployTx(utxos: UTXO[], initBalance: number): Transaction {
        const tx = new Transaction().from(utxos).addOutput(
            new Transaction.Output({
                script: this.lockingScript,
                satoshis: initBalance,
            })
        )
        this.lockTo = { tx, outputIndex: 0 }
        return tx
    }

    // Local method to construct fund collection TX.
    getCallCollectTx(
        prevTx: Transaction,
        recipient: PubKeyHash,
        raisedAmount: bigint
    ): Transaction {
        const inputIndex = 0
        return new Transaction()
            .addInputFromPrevTx(prevTx)
            .setOutput(0, () => {
                return new Transaction.Output({
                    script: buildPublicKeyHashScript(recipient),
                    satoshis: Number(raisedAmount),
                })
            })
            .setInputScript(inputIndex, (tx: Transaction) => {
                this.unlockFrom = { tx, inputIndex }
                return this.getUnlockingScript((self) => {
                    self.collect(raisedAmount)
                })
            })
            .seal()
    }

    // Local method to construct refund TX.
    getCallRefundTx(
        prevTx: Transaction,
        anyone: PubKeyHash,
        privateKey: PrivateKey,
        locktime: number
    ): Transaction {
        const inputIndex = 0
        const tx = new Transaction().addInputFromPrevTx(prevTx)

        tx.setLockTime(locktime)

        tx.setOutput(0, (tx: Transaction) => {
            return new Transaction.Output({
                script: buildPublicKeyHashScript(anyone),
                satoshis: tx.inputAmount - tx.getEstimateFee(),
            })
        })
            .setInputSequence(inputIndex, 1)
            .setInputScript(
                {
                    inputIndex,
                    privateKey,
                },
                (tx: Transaction) => {
                    this.unlockFrom = { tx, inputIndex }
                    return this.getUnlockingScript((self) => {
                        self.refund(Sig(tx.getSignature(0) as string))
                    })
                }
            )
            .seal()

        return tx
    }
}
