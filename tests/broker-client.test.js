// Complete code

const assert = require('assert');
const BrokerClient = require('./v0/src/identity/broker-client');

describe('BrokerClient', () => {
    it('should parse config from env', () => {
        const opts = {
            env: {
                'PACT_BROKER_PERSONA_DID': 'did:example:123',
                'PACT_BROKER_REQUIRE_FRAME': '1',
                'SUDO_UID': '123',
                'PACT_BROKER_ALLOWED_UIDS': '123,456'
            }
        };
        const brokerClient = new BrokerClient(opts);
        const config = brokerClient.get_config();
        assert.deepEqual(config, {
            'PACT_BROKER_PERSONA_DID': 'did:example:123',
            'PACT_BROKER_REQUIRE_FRAME': '1'
        });
    });
});