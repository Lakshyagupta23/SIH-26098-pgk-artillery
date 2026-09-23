class ESADState:
    SAFE = "SAFE"
    SETBACK_DETECTED = "SETBACK_DETECTED"
    SPIN_DETECTED = "SPIN_DETECTED"
    ARMED = "ARMED"

class ESAD:
    """
    Electronic Safe and Arm Device (ESAD) Logic Module.
    Validates the physical firing environment before arming the munition.
    """
    def __init__(self):
        self.state = ESADState.SAFE
        
        # Arming Criteria Thresholds
        self.SETBACK_G_THRESHOLD = 10000.0
        self.SPIN_HZ_THRESHOLD = 150.0
        self.ARM_TIME_THRESHOLD = 1.5
        
        # State memory
        self.has_setback = False
        self.has_spin = False
        
    def update(self, time: float, g_force_axial: float, spin_hz: float) -> str:
        """
        Evaluates the current physical state and transitions the ESAD state machine.
        Must be called sequentially (Setback -> Spin -> Time).
        """
        if self.state == ESADState.ARMED:
            return self.state
            
        # 1. Evaluate Setback
        if not self.has_setback:
            if g_force_axial > self.SETBACK_G_THRESHOLD:
                self.has_setback = True
                self.state = ESADState.SETBACK_DETECTED
        
        # 2. Evaluate Spin (Only valid if Setback was achieved)
        if self.has_setback and not self.has_spin:
            if spin_hz > self.SPIN_HZ_THRESHOLD:
                self.has_spin = True
                self.state = ESADState.SPIN_DETECTED
                
        # 3. Evaluate Time of Flight (Only valid if Spin was achieved)
        if self.has_spin:
            if time > self.ARM_TIME_THRESHOLD:
                self.state = ESADState.ARMED
                
        return self.state

