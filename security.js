const limiters = {
    api:          new SlidingWindowLimiter(60 * 1000, 500),      // 500/دقيقة (كان 200)
    apiUser:      new SlidingWindowLimiter(60 * 1000, 300),      // 300/دقيقة (كان 120)
    login:        new SlidingWindowLimiter(15 * 60 * 1000, 20),  // 20/15د (كان 10)
    loginUser:    new SlidingWindowLimiter(15 * 60 * 1000, 10),  // 10/15د (كان 5)
    register:     new SlidingWindowLimiter(60 * 60 * 1000, 10),  // 10/ساعة (كان 3)
    roomMsg:      new SlidingWindowLimiter(10 * 1000, 15),       // 15/10ث (كان 8)
    privateMsg:   new SlidingWindowLimiter(10 * 1000, 15),       // 15/10ث (كان 10)
    gift:         new SlidingWindowLimiter(60 * 1000, 20),       // 20/دقيقة (كان 10)
    boost:        new SlidingWindowLimiter(60 * 1000, 5),        // 5/دقيقة (كان 3)
    game:         new SlidingWindowLimiter(60 * 1000, 60),       // 60/دقيقة (كان 30)
    call:         new SlidingWindowLimiter(5 * 60 * 1000, 5),    // 5/5د (كان 3)
    friendReq:    new SlidingWindowLimiter(60 * 60 * 1000, 50),  // 50/ساعة (كان 20)
    roomCreate:   new SlidingWindowLimiter(60 * 60 * 1000, 5),   // 5/ساعة (كان 2)
    kick:         new SlidingWindowLimiter(60 * 1000, 20),       // 20/دقيقة (كان 10)
    socketConnect: new SlidingWindowLimiter(60 * 1000, 30),      // 30/دقيقة (كان 10)
    socketEvent:   new TokenBucket(120, 10)                       // 120 cap, 10/s (كان 60, 5)
};

