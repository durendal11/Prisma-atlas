#!/usr/bin/env python3
"""
Simple Network Camera Scanner
==============================
Scans the local network for potential IP cameras on common ports.

Usage:
    python scan_cameras.py
    python scan_cameras.py 192.168.1.0/24
    python scan_cameras.py 192.168.1.100-110
"""

import socket
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from ipaddress import IPv4Network, IPv4Address


# Common camera ports
CAMERA_PORTS = {
    80: "HTTP",
    554: "RTSP",
    8000: "HTTP-Alt",
    8080: "HTTP-Proxy",
    8081: "HTTP-Alt2",
    8888: "HTTP-Alt3",
}


def check_port(ip: str, port: int, timeout: float = 1.0) -> bool:
    """Check if a port is open on a given IP."""
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(timeout)
        result = sock.connect_ex((ip, port))
        sock.close()
        return result == 0
    except:
        return False


def scan_host(ip: str) -> dict:
    """Scan a single host for camera ports."""
    result = {
        'ip': ip,
        'hostname': None,
        'open_ports': []
    }
    
    # Try to get hostname
    try:
        hostname = socket.gethostbyaddr(ip)[0]
        result['hostname'] = hostname
    except:
        pass
    
    # Check each port
    for port, service in CAMERA_PORTS.items():
        if check_port(ip, port, timeout=0.5):
            result['open_ports'].append((port, service))
    
    return result if result['open_ports'] else None


def get_network_range(network_input: str = None) -> list:
    """Get list of IPs to scan."""
    if network_input is None:
        # Try to detect local network
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.connect(("8.8.8.8", 80))
            local_ip = s.getsockname()[0]
            s.close()
            
            # Assume /24 subnet
            ip_parts = local_ip.split('.')
            network = f"{ip_parts[0]}.{ip_parts[1]}.{ip_parts[2]}.0/24"
            print(f"📡 Detected local network: {network}")
            return [str(ip) for ip in IPv4Network(network)]
        except:
            # Default fallback
            network = "192.168.1.0/24"
            print(f"⚠️  Using default network: {network}")
            return [str(ip) for ip in IPv4Network(network)]
    
    # Handle CIDR notation
    if '/' in network_input:
        return [str(ip) for ip in IPv4Network(network_input)]
    
    # Handle range notation (e.g., 192.168.1.100-110)
    if '-' in network_input:
        base, range_part = network_input.rsplit('.', 1)
        start, end = range_part.split('-')
        return [f"{base}.{i}" for i in range(int(start), int(end) + 1)]
    
    # Single IP
    return [network_input]


def scan_network(network_input: str = None, max_workers: int = 50):
    """Scan network for IP cameras."""
    print(f"\n{'='*70}")
    print(f"IP Camera Network Scanner")
    print(f"{'='*70}\n")
    
    ips = get_network_range(network_input)
    total_ips = len(ips)
    
    print(f"🔍 Scanning {total_ips} IP addresses...")
    print(f"🔌 Checking ports: {', '.join(f'{p}({s})' for p, s in CAMERA_PORTS.items())}")
    print(f"\n⏳ This may take a minute...\n")
    
    found_cameras = []
    scanned = 0
    
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        future_to_ip = {executor.submit(scan_host, ip): ip for ip in ips}
        
        for future in as_completed(future_to_ip):
            scanned += 1
            if scanned % 10 == 0:
                print(f"   Progress: {scanned}/{total_ips} ({scanned/total_ips*100:.0f}%)", end='\r')
            
            result = future.result()
            if result:
                found_cameras.append(result)
    
    print(f"\n\n{'='*70}")
    print(f"📊 Scan Complete")
    print(f"{'='*70}\n")
    
    if not found_cameras:
        print("❌ No cameras found on the network")
        print("\nTroubleshooting:")
        print("  • Ensure cameras are powered on")
        print("  • Check if cameras are on the same network")
        print("  • Verify network range (try a different subnet)")
        print("  • Some cameras may have firewalls blocking port scans")
        return
    
    print(f"✅ Found {len(found_cameras)} potential camera(s):\n")
    
    for i, camera in enumerate(found_cameras, 1):
        print(f"📹 Camera {i}:")
        print(f"   IP Address: {camera['ip']}")
        if camera['hostname']:
            print(f"   Hostname: {camera['hostname']}")
        print(f"   Open Ports: ", end='')
        ports_str = ', '.join(f"{port} ({service})" for port, service in camera['open_ports'])
        print(ports_str)
        
        # Suggest RTSP URLs
        if any(port == 554 for port, _ in camera['open_ports']):
            print(f"   Suggested RTSP URLs:")
            print(f"      rtsp://username:password@{camera['ip']}:554/stream1")
            print(f"      rtsp://username:password@{camera['ip']}:554/Streaming/Channels/101")
        
        # Suggest HTTP URLs
        http_ports = [port for port, service in camera['open_ports'] if 'HTTP' in service]
        if http_ports:
            print(f"   Web Interface: http://{camera['ip']}")
            if 8080 in http_ports:
                print(f"   Possible Stream: http://{camera['ip']}:8080/video")
        
        print()
    
    # Generate .env configuration
    print(f"{'='*70}")
    print(f"📝 Suggested .env Configuration:")
    print(f"{'='*70}\n")
    
    for i, camera in enumerate(found_cameras, 1):
        if any(port == 554 for port, _ in camera['open_ports']):
            print(f"CAMERA_PEN_{i}=rtsp://username:password@{camera['ip']}:554/stream1")
        elif any(port == 8080 for port, _ in camera['open_ports']):
            print(f"CAMERA_PEN_{i}=http://{camera['ip']}:8080/video")
        else:
            print(f"# CAMERA_PEN_{i}={camera['ip']}  # Check web interface for stream URL")
    
    print(f"\n{'='*70}")
    print(f"💡 Next Steps:")
    print(f"{'='*70}")
    print(f"1. Verify each camera by accessing its web interface")
    print(f"2. Find the correct RTSP URL in camera settings")
    print(f"3. Test with: python test_camera.py \"rtsp://user:pass@IP:554/path\"")
    print(f"4. Add working URLs to your .env file")
    print(f"{'='*70}\n")


def main():
    """Main entry point."""
    if len(sys.argv) > 1:
        if sys.argv[1] in ['--help', '-h']:
            print(__doc__)
            print("\nExamples:")
            print("  python scan_cameras.py")
            print("  python scan_cameras.py 192.168.1.0/24")
            print("  python scan_cameras.py 192.168.1.100-110")
            print("  python scan_cameras.py 10.0.0.0/24")
            sys.exit(0)
        
        network = sys.argv[1]
    else:
        network = None
    
    try:
        scan_network(network)
    except KeyboardInterrupt:
        print("\n\n⚠️  Scan interrupted by user")
        sys.exit(1)
    except Exception as e:
        print(f"\n❌ Error: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
