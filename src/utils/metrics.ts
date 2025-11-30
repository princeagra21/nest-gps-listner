import { Registry, Counter, Gauge, Histogram } from 'prom-client';

export class MetricsService {
  private registry: Registry;
  
  // Connection metrics
  public activeConnections: Gauge<string>;
  public totalConnections: Counter<string>;
  public disconnections: Counter<string>;
  
  // Packet metrics
  public packetsReceived: Counter<string>;
  public packetsDecoded: Counter<string>;
  public packetDecodingErrors: Counter<string>;
  public packetProcessingDuration: Histogram<string>;
  
  // Device metrics
  public deviceValidations: Counter<string>;
  public deviceValidationErrors: Counter<string>;
  
  // Data forwarding metrics
  public dataForwardSuccess: Counter<string>;
  public dataForwardFailure: Counter<string>;
  public dataForwardDuration: Histogram<string>;
  
  constructor() {
    this.registry = new Registry();
    
    // Initialize connection metrics
    this.activeConnections = new Gauge({
      name: 'tcp_active_connections',
      help: 'Number of active TCP connections',
      labelNames: ['protocol', 'port'],
      registers: [this.registry],
    });
    
    this.totalConnections = new Counter({
      name: 'tcp_total_connections',
      help: 'Total number of TCP connections established',
      labelNames: ['protocol', 'port'],
      registers: [this.registry],
    });
    
    this.disconnections = new Counter({
      name: 'tcp_disconnections',
      help: 'Total number of TCP disconnections',
      labelNames: ['protocol', 'port', 'reason'],
      registers: [this.registry],
    });
    
    // Initialize packet metrics
    this.packetsReceived = new Counter({
      name: 'packets_received_total',
      help: 'Total number of packets received',
      labelNames: ['protocol', 'packet_type'],
      registers: [this.registry],
    });
    
    this.packetsDecoded = new Counter({
      name: 'packets_decoded_total',
      help: 'Total number of packets successfully decoded',
      labelNames: ['protocol', 'packet_type'],
      registers: [this.registry],
    });
    
    this.packetDecodingErrors = new Counter({
      name: 'packet_decoding_errors_total',
      help: 'Total number of packet decoding errors',
      labelNames: ['protocol', 'error_type'],
      registers: [this.registry],
    });
    
    this.packetProcessingDuration = new Histogram({
      name: 'packet_processing_duration_seconds',
      help: 'Packet processing duration in seconds',
      labelNames: ['protocol', 'packet_type'],
      buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1],
      registers: [this.registry],
    });
    
    // Initialize device metrics
    this.deviceValidations = new Counter({
      name: 'device_validations_total',
      help: 'Total number of device validations',
      labelNames: ['result'],
      registers: [this.registry],
    });
    
    this.deviceValidationErrors = new Counter({
      name: 'device_validation_errors_total',
      help: 'Total number of device validation errors',
      labelNames: ['error_type'],
      registers: [this.registry],
    });
    
    // Initialize data forwarding metrics
    this.dataForwardSuccess = new Counter({
      name: 'data_forward_success_total',
      help: 'Total number of successful data forwards',
      registers: [this.registry],
    });
    
    this.dataForwardFailure = new Counter({
      name: 'data_forward_failure_total',
      help: 'Total number of failed data forwards',
      labelNames: ['error_type'],
      registers: [this.registry],
    });
    
    this.dataForwardDuration = new Histogram({
      name: 'data_forward_duration_seconds',
      help: 'Data forward duration in seconds',
      buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5],
      registers: [this.registry],
    });
  }
  
  getRegistry(): Registry {
    return this.registry;
  }
  
  async getMetrics(): Promise<string> {
    return this.registry.metrics();
  }
}

// Singleton instance
export const metrics = new MetricsService();
