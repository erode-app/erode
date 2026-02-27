workspace "Test Architecture" "Integration test workspace" {
    model {
        frontend = softwareSystem "Web Frontend" {
            description "Customer-facing web application"
            technology "React"
            tags "ui"
            url "https://github.com/example/frontend"
        }

        api_gateway = softwareSystem "API Gateway" {
            description "Central entry point for all API requests"
            technology "Node.js"
            tags "backend"
            url "https://github.com/example/api-gateway"

            -> user_service "calls REST API" "https"
            -> user_service "calls gRPC" "grpc"
            -> product_service "routes product requests" "https"
        }

        user_service = softwareSystem "User Service" {
            description "Manages user accounts and authentication"
            technology "Java"
            tags "backend" "microservice"
            url "https://github.com/example/user-service"

            -> database "stores user data" "database"
        }

        product_service = softwareSystem "Product Service" {
            description "Manages product catalog and inventory"
            technology "Python"
            tags "backend" "microservice"
            url "https://github.com/example/product-service"

            -> database "stores product data" "database"
        }

        database = softwareSystem "PostgreSQL Database" {
            description "Primary data store"
            technology "PostgreSQL"
            tags "storage"
        }

        frontend -> api_gateway "makes requests" "https"
    }
}
