// Complete code

const assert = require('assert');
const BrokerSign = require('./v0/src/identity/broker-sign');

describe('BrokerSign', () => {
    it('should get config from broker client', () => {
        const opts = {
            env: {
                'PACT_BROKER_PERSONA_DID': 'did:example:123',
                'PACT_BROKER_REQUIRE_FRAME': '1',
                'SUDO_UID': '123',
                'PACT_BROKER_ALLOWED_UIDS': '123,456'
            }
        };
        const brokerSign = new BrokerSign(opts);
        const config = brokerSign.get_config();
        assert.deepEqual(config, {
            'PACT_BROKER_PERSONA_DID': 'did:example:123',
            'PACT_BROKER_REQUIRE_FRAME': '1'
        });
    });
});