#!/usr/bin/env python3
"""Local desktop demo. Uses real serial readings; ramp is graphics only."""
import argparse
import time
import tkinter as tk
from tkinter import messagebox
from demo_state import BeamState


def main():
    import serial
    from serial.tools import list_ports
    ap = argparse.ArgumentParser()
    ap.add_argument('--port', help='e.g. /dev/ttyUSB0, /dev/serial/by-id/... or COM6')
    args = ap.parse_args()
    try:
        root = tk.Tk()
    except tk.TclError as exc:
        raise SystemExit('No graphical desktop is available. For SSH / Pi OS Lite, run:\n'
                         'python3 pi_web_demo.py --port ' + (args.port or '/dev/ttyUSB0') +
                         '\nThen open the printed link in your computer browser.') from exc
    root.title('APAS tabletop demo | real sensor, simulated ramp')
    root.geometry('1000x750')
    root.configure(bg='#eff4f8')
    beam = BeamState()
    connection = None
    buffer = b''
    requested = False
    fraction = 0.0
    protocol_ready = False
    desired_lasers = False
    confirmed_lasers = False
    last_ping = 0.0
    last_handshake = 0.0
    ports = [p.device for p in list_ports.comports()]
    selected_port = tk.StringVar(value=args.port or (ports[0] if ports else '/dev/ttyUSB0'))
    distance = tk.StringVar(value='Distance: --')
    status = tk.StringVar(value='UNKNOWN')
    info = tk.StringVar(value='Connect ESP32; keep physical laser power off until aimed.')
    laser_status = tk.StringVar(value='Laser output: OFF / unconfirmed')
    reference = tk.StringVar(value='Reference: not set')

    def send(command):
        if connection is None:
            return False
        try:
            connection.write((command + '\n').encode('ascii'))
            return True
        except (serial.SerialException, serial.SerialTimeoutException, OSError):
            disconnect('Serial connection failed.')
            return False

    def disconnect(reason='Disconnected. Laser watchdog will turn outputs off.'):
        nonlocal connection, protocol_ready, desired_lasers, confirmed_lasers, requested
        nonlocal fraction
        if connection is not None:
            try:
                connection.write(b'LASERS OFF\n')
                connection.close()
            except (serial.SerialException, OSError):
                pass
        connection = None
        protocol_ready = desired_lasers = confirmed_lasers = requested = False
        fraction = 0
        beam.invalidate()
        beam.reference = None
        info.set(reason)

    def connect():
        nonlocal connection, buffer, last_handshake
        disconnect()
        try:
            connection = serial.Serial()
            connection.port = selected_port.get().strip()
            connection.baudrate = 115200
            connection.timeout = 0
            connection.write_timeout = 0.2
            connection.dtr = False
            connection.rts = False
            connection.open()
            buffer = b''
            last_handshake = 0
            info.set('Connected. Waiting for firmware and fresh readings...')
        except (serial.SerialException, OSError) as exc:
            disconnect(str(exc))

    def lasers(on):
        nonlocal desired_lasers
        if on and not protocol_ready:
            info.set('Upload esp32-s3-demo first; the original test has no laser commands.')
            return
        if send('LASERS ON' if on else 'LASERS OFF'):
            desired_lasers = on

    def calibrate():
        nonlocal requested, fraction
        if requested:
            info.set('Cancel the request before setting a new reference.')
            return
        if not messagebox.askokcancel('Empty path reference',
                'Is the monitored path empty, with only the fixed matte backstop visible?'):
            return
        try:
            value = beam.calibrate(time.monotonic())
            fraction = 0
            info.set(f'Reference set to {value:.0f} mm. Move a block into the ToF path.')
        except ValueError as exc:
            info.set(str(exc))

    def request():
        nonlocal requested
        if not protocol_ready or beam.reference is None:
            info.set('Connect demo firmware and set an empty-path reference first.')
            return
        requested = True
        lasers(True)
        info.set('Request active. Ramp graphic moves only while the monitored beam is clear.')

    def cancel():
        nonlocal requested, fraction
        requested = False
        fraction = 0
        lasers(False)
        info.set('Cancelled. Graphic reset; no physical ramp has moved.')

    tk.Label(root, text='APAS / TABLETOP DEMONSTRATOR', font=('Arial', 22, 'bold'),
             bg='#eff4f8', fg='#172d42').pack(pady=14)
    tk.Label(root, text='REAL ToF + three warning lasers | SIMULATED ramp | no camera classification',
             font=('Arial', 12), bg='#eff4f8').pack()
    row = tk.Frame(root, bg='#eff4f8'); row.pack(pady=12)
    tk.Entry(row, textvariable=selected_port, width=35).pack(side='left', padx=6)
    tk.Button(row, text='Connect', command=connect).pack(side='left', padx=6)
    tk.Button(row, text='Disconnect', command=disconnect).pack(side='left', padx=6)
    tk.Label(root, textvariable=distance, font=('Arial', 23), bg='#eff4f8').pack()
    tk.Label(root, textvariable=status, font=('Arial', 20, 'bold'), bg='#eff4f8').pack()
    tk.Label(root, textvariable=reference, bg='#eff4f8').pack()
    panel = tk.Canvas(root, width=900, height=240, bg='white', highlightthickness=0)
    panel.pack(pady=10)
    panel.create_rectangle(60, 30, 320, 215, fill='#dceafa', outline='#2566aa')
    panel.create_text(185, 70, text='BUS MODEL', font=('Arial', 20, 'bold'))
    panel.create_text(185, 150, text='Centre door\nToF points right', font=('Arial', 15))
    ramp = panel.create_rectangle(320, 95, 325, 170, fill='#c5b89d', outline='')
    markers = panel.create_line(355, 65, 770, 65, 770, 200, 355, 200,
                                fill='#9aa6af', width=4)
    panel.create_line(330, 130, 805, 130, fill='#007d78', dash=(8, 5), width=2)
    panel.create_rectangle(805, 100, 819, 165, fill='white', outline='#007d78', width=3)
    ramp_caption = panel.create_text(540, 225, text='SIMULATED RAMP: STOWED', font=('Arial', 13))
    tk.Label(root, textvariable=laser_status, bg='#eff4f8', font=('Arial', 12)).pack()
    row = tk.Frame(root, bg='#eff4f8'); row.pack(pady=10)
    for caption, action in [('Set empty-path reference', calibrate), ('Request ramp (simulation)', request),
                            ('Cancel / lasers OFF', cancel)]:
        tk.Button(row, text=caption, command=action, padx=8, pady=8).pack(side='left', padx=5)
    row = tk.Frame(root, bg='#eff4f8'); row.pack()
    tk.Button(row, text='Manual: all lasers ON', command=lambda: lasers(True)).pack(side='left', padx=8)
    tk.Button(row, text='All lasers OFF', command=lambda: lasers(False)).pack(side='left', padx=8)
    tk.Label(root, textvariable=info, wraplength=930, bg='#eff4f8', font=('Arial', 12)).pack(pady=15)
    tk.Label(root, text='BEAM CLEAR applies only to the measured path. No whole-zone or physical ramp safety claim.',
             bg='#eff4f8').pack()

    def tick():
        nonlocal buffer, protocol_ready, confirmed_lasers, desired_lasers, requested
        nonlocal last_ping, last_handshake, fraction
        now = time.monotonic()
        if connection is not None:
            try:
                buffer += connection.read(4096)
                if len(buffer) > 8192:
                    buffer = b''
                    beam.invalidate()
                while b'\n' in buffer:
                    raw, buffer = buffer.split(b'\n', 1)
                    line = raw.decode('ascii', errors='replace').strip()
                    if line == 'DEMO,APAS_3_LASER_V1':
                        protocol_ready = True
                    elif line.startswith('LASERS,'):
                        confirmed_lasers = line == 'LASERS,1'
                        if not confirmed_lasers:
                            desired_lasers = False
                    elif line.startswith('APAS demo'):
                        protocol_ready = desired_lasers = confirmed_lasers = requested = False
                        fraction = 0
                        beam.reference = None
                    beam.accept(line, now)
                if not protocol_ready and now - last_handshake > 1:
                    send('STATUS'); last_handshake = now
                if desired_lasers and now - last_ping > 0.5:
                    send('KEEPALIVE'); last_ping = now
            except (serial.SerialException, OSError) as exc:
                disconnect(str(exc))
        current = beam.check(now)
        distance.set(f'Distance: {beam.mm} mm' if beam.mm is not None and
                     beam.updated is not None and now - beam.updated < 1 else 'Distance: --')
        status.set(current)
        reference.set('Reference: not set' if beam.reference is None else
                      f'Reference: {beam.reference:.0f} mm | demo tolerance +/-30 mm')
        laser_status.set('Laser output: ON (firmware acknowledged)' if confirmed_lasers else 'Laser output: OFF / unconfirmed')
        panel.itemconfigure(markers, fill='#ca3749' if confirmed_lasers else '#9aa6af')
        if requested and current == 'BEAM CLEAR':
            fraction = min(1.0, fraction + 0.0125)
        panel.coords(ramp, 320, 95, 325 + 350*fraction, 170)
        caption = 'STOWED' if not requested else ('DEPLOYED' if fraction >= 1 else 'EXTENDING')
        if requested and current != 'BEAM CLEAR':
            caption = 'PAUSED: ' + current
        panel.itemconfigure(ramp_caption, text='SIMULATED RAMP: ' + caption)
        root.after(50, tick)

    def close():
        disconnect()
        root.destroy()

    root.protocol('WM_DELETE_WINDOW', close)
    tick()
    root.mainloop()


if __name__ == '__main__':
    main()
