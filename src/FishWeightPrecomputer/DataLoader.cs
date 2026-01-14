using System;
using System.Collections.Generic;
using System.IO;
using System.Text.Json;
using System.Linq;

namespace FishWeightPrecomputer
{
    public class DataLoader
    {
        private string _userDataPath;
        private string _mapDataPath;

        public DataLoader(string userDataPath, string mapDataPath)
        {
            _userDataPath = userDataPath;
            _mapDataPath = mapDataPath;
        }

        public T LoadJson<T>(string fileName)
        {
            // Try user data path first, then map data path? 
            // Based on requirements, config JSONs are in `data/1/1001/` (here mapped to _userDataPath)
            // or in map folder.
            // Let's assume absolute or relative path resolution logic.
            
            string path = Path.Combine(_userDataPath, fileName);
            if (!File.Exists(path))
            {
                path = Path.Combine(_mapDataPath, fileName);
                if (!File.Exists(path))
                    throw new FileNotFoundException($"Config file not found: {fileName}", path);
            }

            string json = File.ReadAllText(path);
            return JsonSerializer.Deserialize<T>(json);
        }

        public Dictionary<string, T> LoadDictionary<T>(string fileName)
        {
            return LoadJson<Dictionary<string, T>>(fileName);
        }
        
        // Helper to load specific structures from complex nested JSONs if needed
        // For example fish_env_affinity.json is Dictionary<string, FishEnvAffinity>
    }
}
