export class TransformTimeoutError extends Error {
  constructor(message = "transform exceeded its execution deadline") {
    super(message);
    this.name = "TransformTimeoutError";
  }
}

export class TransformMemoryError extends Error {
  constructor(message = "transform exceeded its memory limit") {
    super(message);
    this.name = "TransformMemoryError";
  }
}
