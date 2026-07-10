# Complete code

import json

class BrokerClient:
    def __init__(self, opts):
        self.opts = opts
        self.config = self._parse_config(opts.env)

    def _parse_config(self, env):
        config = {}
        for key, value in env.items():
            if key.startswith('PACT_'):
                config[key] = value
        return config

    def get_config(self):
        return self.config