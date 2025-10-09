# Glances-Go

![Glances-Go Screenshot](https://i.imgur.com/qZptai6.png)

A minimal, web-based system monitor inspired by [Glances](https://nicolargo.github.io/glances/), built with Go and a simple HTML/CSS/JavaScript frontend.

## Features

-   Real-time monitoring of system metrics.
-   Web-based interface accessible from any device on the network.
-   Lightweight and minimal resource usage.
-   Displays:
    -   CPU Usage
    -   Memory Usage
    -   A list of running processes sorted by CPU usage.

## Getting Started

These instructions will get you a copy of the project up and running on your local machine for development and testing purposes.

### Prerequisites

-   [Go](https://golang.org/doc/install) (version 1.25.1 or later)

### Installation

1.  **Clone the repository:**
    ```sh
    git clone https://github.com/srini-abhiram/glances-go.git
    cd glances-go
    ```

2.  **Install dependencies:**
    The project uses Go modules. Dependencies will be automatically downloaded when you build or run the application. To download them manually:
    ```sh
    go mod tidy
    ```

## Usage

To run the application, execute the following command from the root of the project directory:

```sh
go run .
```

The application will start a web server on port `8080`.

Open your web browser and navigate to [http://localhost:8080](http://localhost:8080) to see the Glances-Go dashboard.

## Building for Production

You can build a single executable for production:

```sh
go build -o glances-go
```

Then run the executable:

```sh
./glances-go
```

## Technology Stack

-   **Backend:** [Go](https://golang.org/)
    -   `net/http` for the web server.
    -   `github.com/shirou/gopsutil` for collecting system metrics.
-   **Frontend:**
    -   HTML
    -   CSS
    -   JavaScript

## Contributing

Pull requests are welcome. For major changes, please open an issue first to discuss what you would like to change.

Please make sure to update tests as appropriate.

## License

This project is licensed under the MIT License - see the [LICENSE.md](LICENSE.md) file for details.
