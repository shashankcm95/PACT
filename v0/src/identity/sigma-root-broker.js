# Complete code

import json
from v0.src.identity.broker_sign import BrokerSign

class SigmaRootBroker:
    def __init__(self, opts):
        self.opts = opts
        self.broker_sign = BrokerSign(opts)

    def get_config(self):
        return self.broker_sign.get_config()