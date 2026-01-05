/**
 * Example test file to verify Jest setup
 */
describe('Jest Setup Verification', () => {
  it('should run tests successfully', () => {
    expect(true).toBe(true);
  });

  it('should support TypeScript', () => {
    const value: number = 42;
    expect(value).toBe(42);
  });
});

