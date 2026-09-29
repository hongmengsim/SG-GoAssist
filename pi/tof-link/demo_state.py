"""Presentation-only beam check. No physical movement commands."""
from collections import deque
from statistics import median


class BeamState:
    def __init__(self):
        self.samples = deque(maxlen=10)
        self.mm = None
        self.updated = None
        self.reference = None
        self.status = 'UNKNOWN'

    def invalidate(self):
        self.mm = None
        self.samples.clear()
        self.status = 'UNKNOWN'

    def accept(self, line, now):
        fields = line.strip().split(',')
        if len(fields) != 4 or fields[1] not in ('VL53L0X', 'VL53L1X'):
            if line.startswith(('ERROR:', 'NOT_READY:', 'NO_FRESH_DATA:', 'APAS demo')):
                self.invalidate()
            return False
        self.updated = now
        try:
            if fields[3] != 'VALID':
                raise ValueError()
            mm = int(fields[2])
            if not 0 < mm < 2000:
                raise ValueError()
        except ValueError:
            self.invalidate()
            return True
        if self.samples and now - self.samples[-1][0] > 1:
            self.samples.clear()
        self.mm = mm
        self.samples.append((now, mm))
        return True

    def calibrate(self, now):
        if (len(self.samples) < 10 or self.updated is None or
                now - self.updated > 1 or now - self.samples[0][0] > 4):
            raise ValueError('Wait for 10 fresh valid readings with the path empty.')
        values = [v for _, v in self.samples]
        if max(values) - min(values) > 30:
            raise ValueError('Reference is moving/noisy. Secure the sensor and backstop.')
        ref = median(values)
        if not 150 <= ref <= 1000:
            raise ValueError('Place the reference board 150-1000 mm away.')
        self.reference = ref
        return ref

    def check(self, now, margin=30):
        if self.updated is None or now - self.updated > 1 or self.mm is None:
            self.status = 'UNKNOWN'
        elif self.reference is None:
            self.status = 'UNCALIBRATED'
        elif self.mm < self.reference - margin:
            self.status = 'BLOCKED'
        elif abs(self.mm - self.reference) > margin:
            self.status = 'UNKNOWN'
        elif (len(self.samples) >= 3 and all(now - t < 1 and
              abs(v - self.reference) <= margin for t, v in list(self.samples)[-3:])):
            self.status = 'BEAM CLEAR'
        else:
            self.status = 'CHECKING'
        return self.status
