"""Benchmark adapter for request-labs/3; production validation is in Rust and Zod."""
def normalize_wire(result):
    return {'entities': [dict(e, kind='lab') if e['field']=='Observation.valueQuantity' else dict(e,kind='context',label=e['value'],unit=None,subject=None) for e in result['entities']]}
