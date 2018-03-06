/*
 * Copyright © 2018 Atomist, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * Ensure the Docker name component is valid.
 * https://docs.docker.com/engine/reference/commandline/tag/#extended-description
 *
 * @param component input component name
 * @return valid Docker name component
 */
export function dockerNameComponent(component: string): string {
    return component.toLocaleLowerCase().replace(/^[^A-Za-z0-9]/, "x").replace(/[^A-Za-z0-9]$/, "x")
        .replace(/[^\w.\-]/g, "_").replace(/\.+/g, ".").replace(/___+/g, "__");
}

/**
 * Ensure the Docker tag is valid.
 * https://docs.docker.com/engine/reference/commandline/tag/#extended-description
 *
 * @param tag input tag
 * @return valid Docker tag
 */
export function dockerTag(tag: string): string {
    return tag.substr(0, 128).replace(/[^\w.\-]/g, "_").replace(/^[^\w]/, "_");
}
