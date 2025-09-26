pragma circom 2.0.0;
include "../node_modules/circomlib/circuits/poseidon.circom";

template PosLeaf() {
    signal input leaf;        // public
    signal input emailHash;   // private
    signal input paraHash;    // private

    component p = Poseidon(2);
    p.inputs[0] <== emailHash;
    p.inputs[1] <== paraHash;

    leaf === p.out;
}
component main = PosLeaf();
