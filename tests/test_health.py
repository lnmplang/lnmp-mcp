from mcp import health_check


def test_health():
    assert health_check() is True
