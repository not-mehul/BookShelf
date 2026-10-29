// Top-level build file. All versions live in gradle/libs.versions.toml.
buildscript {
    dependencies {
        // AGP 9's built-in Kotlin defaults to an older Kotlin Gradle plugin;
        // this documented override compiles with the current Kotlin release.
        classpath(libs.kotlin.gradle.plugin)
    }
}

plugins {
    alias(libs.plugins.android.application) apply false
}
