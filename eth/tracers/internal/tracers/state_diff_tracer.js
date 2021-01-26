// Copyright 2017 The go-ethereum Authors
// This file is part of the go-ethereum library.
//
// The go-ethereum library is free software: you can redistribute it and/or modify
// it under the terms of the GNU Lesser General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// The go-ethereum library is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Lesser General Public License for more details.
//
// You should have received a copy of the GNU Lesser General Public License
// along with the go-ethereum library. If not, see <http://www.gnu.org/licenses/>.

// prestateTracer outputs sufficient information to create a local execution of
// the transaction from a custom assembled genesisT block.
{
	// prestate is the genesisT that we're building.
	prestate: null,

	diffMarkers: {
		Same: "=",
		Born: "+",
		Died: "-",
		Changed: "*",
	},

	isObjectEmpty: function(obj) {
		for (var x in obj) { return false; }
		return true;
	},


	// lookupAccount injects the specified account into the prestate object.
	lookupAccount: function(addr, db, type){
		type = type || this.diffMarkers.Changed;

		var acc = toHex(addr);
		var balance = "0x" + db.getBalance(addr).toString(16);
		console.log('add',acc, type, balance)
		var code = toHex(db.getCode(addr));

		if (this.prestate[acc] === undefined) {
			var nonce = db.getNonce(addr);
      console.log('nonce', type, acc, nonce, balance, code)
			// if (nonce == 1 && code != "0x") {
			// 	type = this.diffMarkers.Born;
			// }


			if (type === this.diffMarkers.Born) {
				this.prestate[acc] = {
					type: type,
					balance: {
						[type]: balance,
					},
					nonce: {
						[type]: nonce,
					},
					code: {
						[type]: code,
					},
					storage: {}
				};
			} else {
				this.prestate[acc] = {
					type: type,
					balance: {
						[type]: {
							"from": balance,
						}
					},
					nonce: {
						[type]: {
							"from": nonce,
						}
					},
					code: {
						[type]: {
							"from": code,
						}
					},
					storage: {}
				};
			}
		}

		// re-read type from prestate
		// type = this.prestate[acc].type;
		this.prestate[acc].type = type;
		if (type == this.diffMarkers.Changed) {
			console.log('🚀 ~ file: state_diff_tracer.js ~ line 89 ~ balance', balance)
			if (balance && balance != this.prestate[acc].balance[type].from) {
				this.prestate[acc].balance[type].to = balance;
			}

			// if (nonce && nonce != this.prestate[acc].nonce[type].from) {
			// 	this.prestate[acc].nonce[type].to = nonce;
			// }

			if (code && code != this.prestate[acc].code[type].from) {
				this.prestate[acc].code[type].to = code;
			}
		}
	},

	// lookupStorage injects the specified storage entry of the given account into
	// the prestate object.
	lookupStorage: function(addr, key, val, db){
		var acc = toHex(addr);
		var idx = toHex(key);

		// if (this.prestate[acc] !== undefined) {
		// 	return;
		// }

		var type = this.prestate[acc].type;

		if (this.prestate[acc].storage[idx] === undefined) {
			if (type === this.diffMarkers.Changed) {
				this.prestate[acc].storage[idx] = {
					[type]: {
						"from": toHex(db.getState(addr, key))
					}
				};
			// } else if (type === this.diffMarkers.Same) {
			// 	this.prestate[acc].storage[idx] = this.diffMarkers.Same;
			} else {
				this.prestate[acc].storage[idx] = {
					[type]: toHex(db.getState(addr, key))
				}
			}
		}

		if (val) {
			if (type === this.diffMarkers.Changed) {
				this.prestate[acc].storage[idx][this.diffMarkers.Changed].to = toHex(val);
			} else {
				this.prestate[acc].storage[idx][type] = toHex(val);
			}
		}
	},

	format: function(db) {
		for (var acc in this.prestate) {
			// Fetch latest balance
			// TODO: optimise
			this.lookupAccount(toAddress(acc), db);

			var accountData = this.prestate[acc];
			var type = accountData.type;

			var changedType = this.diffMarkers.Changed;
			var sameType = this.diffMarkers.Same;

			console.log('🚀 ~ file: state_diff_tracer.js ~ line 147 ~ accountData.balance', type, acc, accountData.balance)
			if (type === changedType) {
				if (accountData.balance[changedType].to === undefined ||
					accountData.balance[changedType].from === accountData.balance[changedType].to) {
					accountData.balance = sameType;
				}

				if (accountData.nonce[changedType].to === undefined ||
					accountData.nonce[changedType].from === accountData.nonce[changedType].to) {
					accountData.nonce = sameType;
				}

				if (accountData.code[changedType].to === undefined ||
					accountData.code[changedType].from === accountData.code[changedType].to) {
					accountData.code = sameType;
				}
			}

			delete this.prestate[acc].type;

			if (accountData.balance === sameType &&
				accountData.nonce === sameType &&
				accountData.code === sameType &&
				this.isObjectEmpty(accountData.storage)
			) {
				delete this.prestate[acc];
				continue;
			}

			for (var idx in accountData.storage) {
				console.log('🚀 ~ file: state_diff_tracer.js ~ line 186 ~ accountData.storage[idx][type]', accountData.storage[idx][type])
				if (type === changedType && accountData.storage[idx][changedType].to === undefined) {
					delete this.prestate[acc].storage[idx];
				} else if (accountData.storage[idx][type] === undefined ||
						/^(0x)?0*$/.test(accountData.storage[idx][type])) {
					delete this.prestate[acc].storage[idx];
				}
			}
		}
	},

	// result is invoked when all the opcodes have been iterated over and returns
	// the final result of the tracing.
	result: function(ctx, db) {

		// At this point, we need to deduct the "value" from the
		// outer transaction, and move it back to the origin
		this.lookupAccount(toAddress(ctx.from), db);

		var fromAccountHex = toHex(ctx.from);
		var toAccountHex = toHex(ctx.to);

		var fromAccountData = this.prestate[fromAccountHex] || {};
		var toAccountData = this.prestate[toAccountHex] || {};

		var fromType = fromAccountData.type;
		var toType = toAccountData.type;

		var changedType = this.diffMarkers.Changed;

		if (fromType === changedType) {
			var fromBal = bigInt(this.prestate[fromAccountHex].balance[changedType].from.slice(2), 16);
			this.prestate[fromAccountHex].balance[changedType].from = "0x" + fromBal.add(ctx.value).toString(16);
		}

		if (toType === changedType) {
			var toBal   = bigInt(this.prestate[toAccountHex].balance[changedType].from.slice(2), 16);
			this.prestate[toAccountHex].balance[changedType].from   = "0x" + toBal.subtract(ctx.value).toString(16);
		}

		if (fromType === changedType) {
			// Decrement the caller's nonce, and remove empty create targets
			var toNonce = this.prestate[fromAccountHex].nonce[changedType].from;
			this.prestate[fromAccountHex].nonce[changedType].from = "0x" + (toNonce - 1).toString(16);
			this.prestate[fromAccountHex].nonce[changedType].to = "0x" + toNonce.toString(16);
		}

		// if (ctx.type == "CREATE") {
		// 	// We can blibdly delete the contract prestate, as any existing state would
		// 	// have caused the transaction to be rejected as invalid in the first place.
		// 	delete this.prestate[toAccountHex];
		// }

		this.format(db);

		// Return the assembled allocations (prestate)
		return this.prestate;
	},

	// step is invoked for every opcode that the VM executes.
	step: function(log, db) {
		// Add the current account if we just started tracing
		if (this.prestate === null){
			this.prestate = {};

			// var contractAddr = log.contract.getAddress();
			// console.log('ex',db.exists(contractAddr));
			// var type = db.exists(contractAddr) ? this.diffMarkers.Changed : this.diffMarkers.Born;
			// Balance will potentially be wrong here, since this will include the value
			// sent along with the message. We fix that in "result()".
			this.lookupAccount(log.contract.getAddress(), db);
		}
		console.log(log.op.toString());
		// Whenever new state is accessed, add it to the prestate
		switch (log.op.toString()) {
			case "EXTCODECOPY": case "EXTCODESIZE": case "BALANCE":
				this.lookupAccount(toAddress(log.stack.peek(0).toString(16)), db);
				break;
			case "CREATE":
				var from = log.contract.getAddress();
				this.lookupAccount(toContract(from, db.getNonce(from)), db, this.diffMarkers.Born);
				break;
			case "CREATE2":
				var from = log.contract.getAddress();
				// stack: salt, size, offset, endowment
				var offset = log.stack.peek(1).valueOf()
				var size = log.stack.peek(2).valueOf()
				var end = offset + size
				this.lookupAccount(toContract2(from, log.stack.peek(3).toString(16), log.memory.slice(offset, end)), db, this.diffMarkers.Born);
				break;
			case "CALL": case "CALLCODE": case "DELEGATECALL": case "STATICCALL":
				var address = toAddress(log.stack.peek(1).toString(16));
				if (isPrecompiled(address)) {
					break;
				}
				this.lookupAccount(address, db);
				break;
			case "SLOAD":
				this.lookupStorage(log.contract.getAddress(), toWord(log.stack.peek(0).toString(16)), null, db);
				break;
			case "SSTORE":
				this.lookupStorage(log.contract.getAddress(), toWord(log.stack.peek(0).toString(16)), toWord(log.stack.peek(1).toString(16)), db);
				break;
			case "SELFDESTRUCT":
				this.lookupAccount(log.contract.getAddress(), db, this.diffMarkers.Died);
				break;
		}
	},

	// fault is invoked when the actual execution of an opcode fails.
	fault: function(log, db) {}
}
