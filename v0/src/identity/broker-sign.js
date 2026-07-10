# Complete code

import json
from v0.src.identity.broker_client import BrokerClient

class BrokerSign:
    def __init__(self, opts):
        self.opts = opts
        self.broker_client = BrokerClient(opts)

    def get_config(self):
        return self.broker_client.get_config()