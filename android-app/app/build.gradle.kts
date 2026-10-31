plugins {
    // AGP 9 compiles Kotlin itself (built-in Kotlin) — no kotlin-android plugin.
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.compose)
}

android {
    namespace = "app.mehul.bookshelf"
    compileSdk = 37

    defaultConfig {
        applicationId = "app.mehul.bookshelf"
        minSdk = 26
        targetSdk = 37
        versionCode = 4
        versionName = "0.4.0"
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    buildFeatures {
        compose = true
    }

    lint {
        abortOnError = true
        // AGP is pinned to the newest version Android Studio 2026.2 supports;
        // upgrade it together with Android Studio (the Upgrade Assistant flags it).
        disable += "AndroidGradlePluginVersion"
    }
}

dependencies {
    implementation(libs.androidx.activity)
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.documentfile)
    implementation(libs.androidx.fragment)
    implementation(libs.androidx.glance.appwidget)
    implementation(libs.androidx.lifecycle.runtime)
    implementation(libs.androidx.webkit)
    implementation(libs.androidx.work.runtime)
    implementation(libs.kotlinx.coroutines.android)
    implementation(libs.play.services.code.scanner)

    testImplementation(libs.junit)
    testImplementation(libs.kotlin.test.junit)
    testImplementation(libs.org.json)
}
