class ApiResponse {
    constructor(statusCode, data, message = "Connection Successfull") {
        this.statusCode = statusCode;
        this.data = data
        this.message = message
        this.success = this.statusCode < 400
    }
}

export default ApiResponse;