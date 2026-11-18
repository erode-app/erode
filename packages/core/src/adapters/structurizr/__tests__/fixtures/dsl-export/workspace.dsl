workspace "Shop" "DSL export fixture: flat identifiers, no erode.id" {
    model {
        customer = person "Customer"

        shop = softwareSystem "Shop" {
            storefront = container "Storefront" {
                technology "TypeScript"
                url "https://github.com/example/storefront"
            }
            orders = container "Order Service" {
                technology "Java"
                url "https://github.com/example/orders"

                orderApi = component "Order API"
                component "Payment Adapter"
            }
        }

        payments = softwareSystem "Payment Provider"

        customer -> storefront "Browses"
        storefront -> orders "Places orders" "HTTPS"
        orderApi -> payments "Charges cards"
    }
}
