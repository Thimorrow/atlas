plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
}

android {
    namespace = "dev.atlas.wrap"
    compileSdk = 36

    defaultConfig {
        // Eigene Id, damit Wrapper und native App nebeneinander auf demselben
        // Geraet liegen koennen. Sonst ueberschriebe eine die andere.
        applicationId = "dev.atlas.wrap"
        minSdk = 26
        targetSdk = 36
        versionCode = 1
        versionName = "0.1.0"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlin {
        compilerOptions {
            jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17)
        }
    }
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.activity)
    // Zieht lifecycle auf dieselbe Fassung wie :app. Ohne das verlangt
    // activity-ktx von sich aus eine aeltere, die hier nirgends sonst vorkommt.
    implementation(libs.androidx.lifecycle.runtime.ktx)
    testImplementation(libs.junit)
}
