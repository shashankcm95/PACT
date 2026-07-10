// Complete code

const assert = require('assert');
const SigmaRootBroker = require('./v0/src/identity/sigma-root-broker');

describe('SigmaRootBroker', () => {
    it('should get config from broker sign', () => {
        const opts = {
            env: {
                'PACT_BROKER_PERSONA_DID': 'did:example:123',
                'PACT_BROKER_REQUIRE_FRAME': '1',
                'SUDO_UID': '123',
                'PACT_BROKER_ALLOWED_UIDS': '123,456'
            }
        };
        const sigmaRootBroker = new SigmaRootBroker(opts);
        const config = sigmaRootBroker.get_config();
        assert.deepEqual(config, {
            'PACT_BROKER_PERSONA_DID': 'did:example:123',
            'PACT_BROKER_REQUIRE_FRAME': '1'
        });
    });
});