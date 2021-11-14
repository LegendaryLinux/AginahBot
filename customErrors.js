module.exports = {
  /**
   * Custom Exception for parsing custom date/time formats
   * The constructor should always be given a friendly error message, presentable to a user.
   */
  TimeParserValidationError: class extends Error {
    constructor(message) {
      super(message);
      this.name = 'TimeParserValidationError';
    }
  }
};
