pluginManagement {
    repositories {
        google {
            content {
                includeGroupByRegex("com\\.android.*")
                includeGroupByRegex("com\\.google.*")
                includeGroupByRegex("androidx.*")
            }
        }
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}

rootProject.name = "Atlas"
include(":app")
// Zweite App aus demselben Repo: dieselbe Web-App in einer WebView. Sie teilt
// sich mit :app nur die Werkzeugkette, keinen Code -- deshalb ein eigenes Modul
// und keine Produktvariante.
include(":wrap")
